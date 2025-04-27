import aiohttp
import asyncio
import re
import json
from typing import Dict, List, Any
import os
from dotenv import load_dotenv
import logging
import ssl
import certifi

# Initialize logging
logger = logging.getLogger(__name__)
if not logging.root.handlers:
    logging.basicConfig(level=logging.INFO)

load_dotenv()

def load_config() -> Dict[str, Any]:
    """
    Load configuration from the config file.
    
    Returns:
        Dict[str, Any]: Configuration containing all fields from the config file
    """
    # Determine config file path: use env var or default to backend/config/backend_config.json
    config_file_path = os.environ.get('CONFIG_FILE_PATH')
    if not config_file_path:
        base_dir = os.path.dirname(__file__)
        config_file_path = os.path.join(base_dir, 'config', 'backend_config.json')
    try:
        with open(config_file_path, 'r') as f:
            config = json.load(f)
            return config
    except FileNotFoundError:
        raise RuntimeError(f"Config file not found at {config_file_path}")
    except json.JSONDecodeError:
        raise RuntimeError(f"Error decoding JSON from config file at {config_file_path}")
    except Exception as e:
        raise RuntimeError(f"Failed to load config file at {config_file_path}: {str(e)}")


async def get_vaults_from_indexer(session: aiohttp.ClientSession, indexer_url: str) -> List[Dict[str, Any]]:
    """
    Asynchronously retrieve all vault data from the indexer.
    """
    vaults_endpoint = f"{indexer_url}/v0/vaults"
    try:
        async with session.get(vaults_endpoint) as response:
            response.raise_for_status()  # Raise an exception for bad status codes
            vaults = await response.json()
            logger.info(f"Successfully fetched {len(vaults)} vaults from indexer.")
            return vaults
    except aiohttp.ClientError as e:
        logger.error(f"Error fetching vaults from indexer at {vaults_endpoint}: {str(e)}")
        raise ValueError(f"Could not connect to or fetch data from the indexer: {str(e)}")
    except Exception as e:
        logger.error(f"An unexpected error occurred while fetching vaults: {str(e)}")
        raise ValueError(f"An unexpected error occurred: {str(e)}")


async def get_owned_objects(session: aiohttp.ClientSession, sui_api_url: str, owner: str) -> List[Dict[str, Any]]:
    """
    Asynchronously retrieve all owned objects for a given owner, handling pagination.
    """
    all_objects = []
    cursor = None
    # Pagination loop
    while True:
        # Build query object with options and optional cursor
        query = {
            "options": {
                "showType": True,
                "showOwner": False,
                "showPreviousTransaction": False,
                "showDisplay": False,
                "showContent": True,
                "showBcs": False,
                "showStorageRebate": False
            }
        }
        request = {
            "jsonrpc": "2.0",
            "id": 1,
            "method": "suix_getOwnedObjects",
            "params": [owner, query, cursor]
        }
        logger.debug(f"suix_getOwnedObjects request: %s", request)
        async with session.post(sui_api_url, json=request) as response:
            result = await response.json()
        logger.debug("suix_getOwnedObjects response: %s", result)
        data = result.get('result', {})
        all_objects.extend(data.get('data', []))
        # Update cursor for next page
        if data.get('hasNextPage'):
            cursor = data.get('nextCursor')
            logger.debug("Next cursor: %s", cursor)
        else:
            break
    return all_objects


async def get_collateral_objects(session: aiohttp.ClientSession, sui_api_url: str, owner: str, account: str, contract_address: str) -> List[Dict[str, Any]]:
    """
    Asynchronously retrieve collateral objects owned by a specified owner.
    """
    owned_objects = await get_owned_objects(session, sui_api_url, owner)
    collateral_objects = []
    
    type_regex = rf"{contract_address}\w*::collateral::Collateral<(0x\w*::\S*::\S*)>"
    
    for obj in owned_objects:
        collateral_match = re.match(type_regex, obj['data']['type'])
        if not collateral_match:
            continue
        elif obj['data']['content']['fields']['account_id'] == account:
            collateral_objects.append(obj)
            
    return collateral_objects


async def form_coin_type_prgm_triples(session: aiohttp.ClientSession, sui_api_url: str, owner: str, account: str, contract_address: str) -> List[Dict[str, str]]:
    """
    Asynchronously form triples that contain the "coin", "type", and "program_id" values from the collateral objects.
    """
    triples = []
    collateral_objects = await get_collateral_objects(session, sui_api_url, owner, account, contract_address)
    for obj in collateral_objects:
        data = obj['data']
        triple = {
            "coin": data['content']['fields']['coin'],
            "type": data['type'],
            "program_id": data['content']['fields']['program_id'],
        }
        triples.append(triple)
    return triples
    

async def get_objects(session: aiohttp.ClientSession, sui_api_url: str, addresses: List[str]) -> List[Dict[str, Any]]:
    """
    Get multiple objects using sui_multiGetObjects.
    
    Args:
        session: The aiohttp client session
        sui_api_url: The API URL to query
        addresses: List of object addresses
    
    Returns:
        List[Dict[str, Any]]: List of objects
    """
    if not addresses:
        return []
    
    request = {
        "jsonrpc": "2.0",
        "id": 1,
        "method": "sui_multiGetObjects",
        "params": [
            addresses,
            {
                "showType": True,
                "showOwner": True,
                "showPreviousTransaction": False,
                "showDisplay": False,
                "showContent": True,
                "showBcs": False,
                "showStorageRebate": False
            }
        ]
    }

    try:
        async with session.post(sui_api_url, json=request) as response:
            result = await response.json()
            return result.get('result', [])
    except Exception as e:
        raise ValueError(f"Error getting objects: {str(e)}")


def convert_feed_bytes_to_hex_str(feed_bytes: List[int]) -> str:
    """
    Convert feed bytes to hex string.
    """
    feed_hex_str = "0x"
    for byte in feed_bytes:
        feed_hex_str += f"{byte:02x}"
    return feed_hex_str


async def get_price_feed(session: aiohttp.ClientSession, feed_id: str, pyth_url: str) -> Dict[str, Any]:
    """
    Asynchronously get price feed updates from Pyth API.
    """
    query_args = f"ids%5B%5D={feed_id}"
    
    async with session.get(pyth_url + query_args) as response:
        result = await response.json()
        return result['parsed'][0]


def join_collaterals(dict_list1: List[Dict[str, Any]], dict_list2: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Perform an inner join between two lists of dictionaries.
    """
    dict2_lookup = {"0x" + item['fields']['token_info']: item['fields'] for item in dict_list2}
    joined_list = []
    
    for item1 in dict_list1:
        match = re.match(r"\w*::collateral::Collateral<(0x\w*::\S*::\S*)>", item1['type'])
        if match and match.group(1) in dict2_lookup:
            joined_item = {**item1, **dict2_lookup[match.group(1)]}
            joined_list.append(joined_item)
    
    return joined_list


async def calc_total_account_value(owner: str, account: str, contract_address: str) -> float:
    """
    Calculate the total value of a specific account using the provided parameters.

    Args:
        owner (str): Owner address
        account (str): Account ID
        contract_address (str): Contract address
    
    Returns:
        float: The total account value
    """

    config = load_config()
    sui_api_url = config["sui_api_url"]
    contract_address = config["contract_address"]
    pyth_url = config["pyth_price_feed_url"]
        
    if not sui_api_url or not contract_address:
        raise ValueError("SUI API URL or Contract Address not specified in config or parameters")
    
    # Create SSL context using certifi
    ssl_context = ssl.create_default_context(cafile=certifi.where())

    async with aiohttp.ClientSession(connector=aiohttp.TCPConnector(ssl=ssl_context)) as session:
        collateral_triples = await form_coin_type_prgm_triples(session, sui_api_url, owner, account, contract_address)
        
        account_value = 0
        suppported_collateral_list = []
        programs_retreieved = {}
        
        for triple in collateral_triples:
            if triple['program_id'] in programs_retreieved.keys():
                continue
            programs_retreieved[triple['program_id']] = True
            
        programs = await get_objects(session, sui_api_url, list(programs_retreieved.keys()))
        
        for program in programs:
            suppported_collateral_list += program['data']['content']['fields']['supported_collateral']
        
        joined_list = join_collaterals(collateral_triples, suppported_collateral_list)
        
        # Create a list of coroutines for concurrent execution
        price_feed_tasks = []
        for item in joined_list:
            feed_id = convert_feed_bytes_to_hex_str(item['price_feed_id_bytes'])
            price_feed_tasks.append(get_price_feed(session, feed_id, pyth_url))
        
        # Execute all price feed requests concurrently
        price_feed_results = await asyncio.gather(*price_feed_tasks)
        
        # Calculate the account value using the results
        for item, feed_data in zip(joined_list, price_feed_results):
            account_value += int(item['coin']) * int(feed_data['price']['price']) * pow(10, (-1 * item['token_decimals']) + feed_data['price']['expo'])
            
        return account_value


def filter_vault_objects(owned_objects: List[Dict]) -> List[Dict]:
    """
    Filter the list of owned objects to return only the vault objects.
    
    A vault object has a type matching the pattern: *::lp::Vault<*>
    
    Args:
        owned_objects: List of objects owned by a contract
        
    Returns:
        List of vault objects
    """
    vault_objects = []
    
    for obj in owned_objects:
        try:
            obj_type = obj.get('data', {}).get('type', '')
            # Check if the object type matches the vault pattern
            if '::lp::Vault<' in obj_type:
                vault_objects.append(obj)
        except Exception as e:
            raise ValueError(f"Error processing object: {str(e)}")
            
    return vault_objects


async def parse_vault_token_type(token_type: str) -> str:
    """
    Parse the vault token type string to extract relevant information.
    Example: 0x...::lp::Vault<0x...::test_coin::TEST_COIN, 0x...::test_coin::TEST_COIN>
    
    Returns:
        - coin_type: the first token type (the coin that the vault holds)
    """
    
    # Extract content inside angle brackets
    angle_content = token_type.split("<")[1].split(">")[0]
    coin_type = angle_content.split(",")[0].strip()
        
    # Also keep the full list of token types for backward compatibility
    #token_types = [t.strip() for t in angle_content.split(",")]
    #result["token_types"] = token_types
    
    return coin_type
    

async def calc_total_vault_values() -> Dict:
    """
    Calculate the total value locked across all vaults fetched from the indexer.
        
    Returns:
        Dict: Dictionary containing vault value information
    """
    # Load config once at the beginning
    config = load_config()
    sui_api_url = config.get("sui_api_url", None)
    indexer_url = config.get("indexer_url", None) 
    global_address = config.get("contract_global", None)
    pyth_url = config.get("pyth_price_feed_url", None)
    
    if not sui_api_url or not global_address or not pyth_url or not indexer_url:
        raise ValueError("Error loading config: One or more required fields are missing (sui_api_url, contract_global, pyth_price_feed_url, indexer_url)")
    
    # Create SSL context using certifi
    ssl_context = ssl.create_default_context(cafile=certifi.where())
    
    async with aiohttp.ClientSession(connector=aiohttp.TCPConnector(ssl=ssl_context)) as session:
        # Fetch vault data from the indexer
        indexer_vaults = await get_vaults_from_indexer(session, indexer_url)
        if not indexer_vaults:
            logger.warning("No vaults returned from the indexer.")
            return {
                "totalValueLocked": 0.0,
                "vaults": [],
                "count": 0
            }

        # Extract vault addresses from the indexer data
        vault_addresses = [v['vault_address'] for v in indexer_vaults]
        # Create a mapping from vault_address to coin_token_info for later use
        vault_address_to_coin_info = {v['vault_address']: v['coin_token_info'] for v in indexer_vaults}

        # Get all vault objects using multiGetObjects with the extracted addresses
        vault_objects = await get_objects(session, sui_api_url, vault_addresses)
        global_object = await get_objects(session, sui_api_url, [global_address])
        if not global_object:
            raise ValueError("Could not retrieve global object")
        
        # Extract supported LP tokens and price feed bytes from global object
        global_data = global_object[0]['data']['content']['fields']
        #print(f"\n\nGLOBAL DATA:\n {global_data}\n")
        supported_lp = global_data.get('supported_lp', [])
        # price_feed_bytes = global_data.get('price_feed_bytes', []) # Removed: This field is now inside TokenIdentifier

        if not supported_lp: # Changed check: Only need supported_lp
            raise ValueError("Global object missing supported_lp")

        # Create a mapping from coin type (token_info) to its price feed bytes and decimals
        coin_type_to_token_data = {}
        for token_id_obj in supported_lp:
            # Assuming the structure from Sui API follows: { type: "...", fields: { ... } }
            fields = token_id_obj.get('fields', {})
            token_info = fields.get('token_info')
            price_feed_bytes = fields.get('price_feed_id_bytes')
            token_decimals = fields.get('token_decimals')
            if token_info and price_feed_bytes is not None and token_decimals is not None:
                 # Ensure token_info starts with 0x for consistency if needed, adjust if format differs
                 # formatted_token_info = token_info if token_info.startswith("0x") else f"0x{token_info}"
                 # Using raw token_info as key for now, assuming parse_vault_token_type returns matching format
                coin_type_to_token_data[token_info] = {
                    'price_feed_id_bytes': price_feed_bytes,
                    'token_decimals': token_decimals
                }
            else:
                logger.warning(f"Skipping invalid TokenIdentifier in supported_lp: {token_id_obj}")

        #print(f"\nCoin type to token data mapping: {coin_type_to_token_data}\n")

        cumulative_vault_total = 0.0
        vault_details = []
        error_occurred = False # Flag to track errors

        # Create price feed fetch tasks for concurrent execution
        price_feed_tasks = []
        vault_coin_types = []

        # Process each vault object to prepare price feed requests
        for vault in vault_objects:
            try:
                vault_data = vault.get('data', {})
                #print(vault_data)
                vault_type = vault_data.get('type', '') # needs changing
                content = vault_data.get('content', {})
                fields = content.get('fields', {})
                #print(f"\n\nFIELDS:\n {fields}\n")

                # Get the vault's balance/amount
                coin = float(fields.get('coin', 0))
                # No need to warn here if coin is 0, handled later

                # Parse token type to extract underlying asset information
                coin_type = await parse_vault_token_type(vault_type)
                #print(f"\nCOIN_TYPE: {coin_type}\n")

                # Find the token data for this coin type in the mapping
                if coin_type in coin_type_to_token_data:
                    token_data = coin_type_to_token_data[coin_type]
                    feed_bytes = token_data['price_feed_id_bytes']
                    token_decimals = token_data['token_decimals']

                    # Convert feed bytes to hex string for Pyth API
                    feed_id = convert_feed_bytes_to_hex_str(feed_bytes)

                    # Add to list of tasks
                    price_feed_tasks.append(get_price_feed(session, feed_id, pyth_url))
                    vault_coin_types.append({
                        "object_id": vault_data.get('objectId', ''),
                        "type": vault_type,
                        "coin": coin,
                        "coin_type": coin_type,
                        "feed_id": feed_id,
                        "token_decimals": token_decimals # Store decimals
                    })
                else:
                    # If coin type is not supported, this is an error condition for the entire process
                    logger.error(f"Coin type '{coin_type}' from vault {vault_data.get('objectId', 'N/A')} not found in supported_lp mapping.")
                    error_occurred = True
                    break # Stop processing vaults
            except Exception as e:
                # Log the specific vault object causing the error and set error flag
                logger.error(f"Error processing vault object {vault.get('data', {}).get('objectId', 'N/A')}: {str(e)}")
                error_occurred = True
                break # Stop processing vaults
        
        # If an error occurred while processing vault objects, raise immediately
        if error_occurred:
            raise ValueError("Failed to process one or more vault objects.")

        # Execute all price feed requests concurrently
        if price_feed_tasks:
            price_feed_results = await asyncio.gather(*price_feed_tasks, return_exceptions=True)
            #print(f"\n\nPrice feed results:\n {price_feed_results}\n")

            # Calculate values using price feed results
            for i, (vault_info, price_result) in enumerate(zip(vault_coin_types, price_feed_results)):
                try:
                    token_decimals = vault_info['token_decimals'] # Retrieve decimals

                    # Check if price fetching failed for this specific vault
                    if isinstance(price_result, Exception):
                        logger.error(f"Failed to fetch price for {vault_info['coin_type']} (Feed ID: {vault_info['feed_id']}): {str(price_result)}")
                        error_occurred = True
                        break # Stop processing values

                    # Handle zero balance case (not an error, just zero value)
                    if vault_info['coin'] == 0:
                        value = 0.0
                    else:
                        # Proceed if balance is non-zero and price result is valid
                        if isinstance(price_result, dict):
                            price_data = price_result.get('price', {})
                            price = price_data.get('price')
                            expo = price_data.get('expo')

                            if price is not None and expo is not None:
                                price = int(price)
                                # Apply decimal conversion
                                value = vault_info['coin'] * price * pow(10, expo - token_decimals)
                            else:
                                logger.error(f"Price or expo missing in price feed result for {vault_info['coin_type']}: {price_result}")
                                error_occurred = True
                                break # Stop processing values
                        else:
                            # Should not happen if gather didn't return an Exception, but good to check
                            logger.error(f"Invalid price result format for {vault_info['coin_type']}: {price_result}")
                            error_occurred = True
                            break # Stop processing values

                    # Add to total and details (only if no error occurred so far in this loop)
                    cumulative_vault_total += value
                    vault_detail = {
                        "object_id": vault_info['object_id'],
                        "type": vault_info['type'],
                        "coin": vault_info['coin'],
                        "coin_type": vault_info['coin_type'],
                        "value": value,
                        "token_decimals": token_decimals
                    }
                    vault_details.append(vault_detail)

                except (TypeError, ValueError, KeyError, Exception) as e:
                    # Catch potential errors during calculation or data access
                    logger.error(f"Error calculating vault value for {vault_info.get('object_id', 'N/A')} (Coin Type: {vault_info.get('coin_type', 'N/A')}): {str(e)}")
                    error_occurred = True
                    break # Stop processing values
            
            # Check if an error occurred during value calculation/price processing
            if error_occurred:
                raise ValueError("Failed to process prices or calculate value for one or more vaults.")

        # If we reach here without errors
        return {
            "totalValueLocked": cumulative_vault_total,
            "vaults": vault_details,
            "count": len(vault_details)
        }


async def get_lp_balance(owner: str, vault_id: str) -> float:
    """
    Retrieve the LP token balance for a given owner and vault using getOwnedObjects.
    Fetches specific vault configuration from the indexer using the vault_address.
    Args:
        owner (str): The Sui address of the owner
        vault_id (str): The vault identifier (must be the vault_address)
    Returns:
        float: The LP token balance for the owner in the specified vault
    """
    config = load_config()
    sui_api_url = config["sui_api_url"]
    indexer_url = config["indexer_url"]

    async with aiohttp.ClientSession() as session:
        # Construct the specific vault endpoint URL
        vault_endpoint = f"{indexer_url}/v0/vaults/{vault_id}"
        logger.debug(f"Fetching vault details from: {vault_endpoint}")

        try:
            # Fetch the specific vault data from the indexer
            async with session.get(vault_endpoint) as response:
                if response.status == 404:
                    raise ValueError(f"Vault not found at indexer for address: {vault_id}")
                response.raise_for_status() # Raise an exception for other bad status codes (e.g., 500)
                vault = await response.json()
                logger.debug(f"Successfully fetched vault data: {vault}")
        except aiohttp.ClientError as e:
            logger.error(f"Error fetching vault from indexer at {vault_endpoint}: {str(e)}")
            raise ValueError(f"Could not connect to or fetch data from the indexer: {str(e)}")
        except Exception as e:
            # Catch potential JSON decoding errors or other issues
            logger.error(f"An unexpected error occurred fetching vault {vault_id}: {str(e)}")
            raise ValueError(f"An unexpected error occurred fetching vault details: {str(e)}")

        # Extract the lp_token_info which corresponds to the LP token type needed for filtering
        lp_token_info = vault.get("lp_token_info")
        if not lp_token_info:
             raise ValueError(f"Indexer response for vault {vault_id} missing 'lp_token_info' field.")
             
        lp_type = f"0x2::coin::Coin<0x{lp_token_info}>" # Construct the full Coin<T> type
        logger.debug(f"Looking for LP type: {lp_type} for owner {owner}")

        # Get owned objects for the user
        owned_objects = await get_owned_objects(session, sui_api_url, owner)
        
        # Filter for objects matching the specific LP token type
        lp_objects = [obj for obj in owned_objects if obj.get('data', {}).get('type') == lp_type]
        logger.debug(f"Number of LP objects found for type {lp_type}: {len(lp_objects)}")
        logger.debug("Filtered LP objects: %s", lp_objects)
        
        # Sum balances from object fields
        total = 0
        for obj in lp_objects:
            try:
                balance = int(obj['data']['content']['fields'].get('balance', 0))
                total += balance
            except (KeyError, ValueError, TypeError) as e:
                logger.warning(f"Could not parse balance for object {obj.get('data', {}).get('objectId', '(unknown ID)')}: {e}")
                continue
        return float(total)
