import aiohttp
import asyncio
import re
import json
from typing import Dict, List, Any
import os
from dotenv import load_dotenv
import logging

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
            # Expose vault addresses list for backward compatibility and convenience
            config['vault_addresses'] = [v.get('vault_address') for v in config.get('vaults', [])]
            return config
    except Exception as e:
        raise RuntimeError(f"Failed to load config file at {config_file_path}: {str(e)}")


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
    Asynchronously calculate the total account value.
    
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
    
    async with aiohttp.ClientSession() as session:
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
    Calculate the total value locked across all vaults defined in the config.
        
    Returns:
        Dict: Dictionary containing vault value information
    """
    # Load config once at the beginning
    config = load_config()
    sui_api_url = config.get("sui_api_url", None)
    vault_addresses = config.get("vault_addresses", None)
    global_address = config.get("contract_global", None)
    pyth_url = config.get("pyth_price_feed_url", None)
    
    if not sui_api_url or not vault_addresses or not global_address or not pyth_url:
        raise ValueError("Error loading config: One or more fields are missing")
    
    async with aiohttp.ClientSession() as session:
        # Get all vault objects using multiGetObjects
        vault_objects = await get_objects(session, sui_api_url, vault_addresses)
        global_object = await get_objects(session, sui_api_url, [global_address])
        if not global_object:
            raise ValueError("Could not retrieve global object")
        
        # Extract supported LP tokens and price feed bytes from global object
        global_data = global_object[0]['data']['content']['fields']
        #print(f"\n\nGLOBAL DATA:\n {global_data}\n")
        supported_lp = global_data.get('supported_lp', [])
        price_feed_bytes = global_data.get('price_feed_bytes', [])
        
        if not supported_lp or not price_feed_bytes:
            raise ValueError("Global object missing supported_lp or price_feed_bytes")
        
        # Create a mapping of coin type to its index in the supported_lp list
        coin_type_to_index = {}
        for i, lp_entry in enumerate(supported_lp):
            #print(i, lp_entry)
            coin_type_to_index[f"0x{lp_entry}"] = i
        #print(f"\nCoin type to index mapping: {coin_type_to_index}\n")
        
        cumulative_vault_total = 0.0
        vault_details = []
        
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
                if coin == 0:
                    logger.warning(f"No coin balance found for vault: {vault_data.get('objectId', '')}")
                
                
                # Parse token type to extract underlying asset information
                coin_type = await parse_vault_token_type(vault_type)
                #print(f"\nCOIN_TYPE: {coin_type}\n")
                
                # Find the index of this coin type in the supported_lp list
                if coin_type in coin_type_to_index:
                    index = coin_type_to_index[coin_type]
                    if index < len(price_feed_bytes):
                        # Get the corresponding price feed bytes
                        feed_bytes = price_feed_bytes[index]
                        
                        # Convert feed bytes to hex string for Pyth API
                        feed_id = convert_feed_bytes_to_hex_str(feed_bytes)
                        
                        # Add to list of tasks
                        price_feed_tasks.append(get_price_feed(session, feed_id, pyth_url))
                        vault_coin_types.append({
                            "object_id": vault_data.get('objectId', ''),
                            "type": vault_type,
                            "coin": coin,
                            "coin_type": coin_type,
                            "feed_id": feed_id
                        })
                else:
                    raise ValueError(f"Coin type not found in supported_lp: {coin_type}")
            except Exception as e:
                raise ValueError(f"Error processing vault object: {str(e)}")
        
        # Execute all price feed requests concurrently
        if price_feed_tasks:
            price_feed_results = await asyncio.gather(*price_feed_tasks, return_exceptions=True)
            #print(f"\n\nPrice feed results:\n {price_feed_results}\n")
            
            # Calculate values using price feed results
            for i, (vault_info, price_result) in enumerate(zip(vault_coin_types, price_feed_results)):
                try:
                    #print(price_result)
                    if not isinstance(price_result, Exception):
                        # Get token info from global object based on coin type
                        coin_type = vault_info['coin_type']
                        #print(f"Processing vault for coin type: {coin_type}\n")
                        #print(f'price_result: {price_result}\n')
                        index = coin_type_to_index.get(coin_type)
                        
                        if index is not None and index < len(supported_lp):                            
                            # Calculate value based on price feed data
                            if isinstance(price_result, dict):
                                price = price_result.get('price', {}).get('price', 0)
                                expo = price_result.get('price', {}).get('expo', 0)
                                
                                # Apply decimal conversion based on token decimals and price expo
                                value = vault_info['coin'] * int(price) * pow(10, expo)
                            else:
                                raise Exception(f"Invalid price result format for {vault_info['coin_type']}")
                            
                            # Add to total and details
                            cumulative_vault_total += value
                            
                            vault_detail = {
                                "object_id": vault_info['object_id'],
                                "type": vault_info['type'],
                                "coin": vault_info['coin'],
                                "coin_type": vault_info['coin_type'],
                                "value": value
                            }
                            
                            vault_details.append(vault_detail)
                    else:
                        raise Exception(f"Failed to fetch price for {vault_info['coin_type']}: {str(price_result)}")
                except Exception as e:
                    logger.error(f"Error calculating vault value: {str(e)}")
        
        return {
            "totalValueLocked": cumulative_vault_total,
            "vaults": vault_details,
            "count": len(vault_details)
        }


async def get_lp_balance(owner: str, vault_id: str) -> float:
    """
    Retrieve the LP token balance for a given owner and vault using getOwnedObjects.
    Args:
        owner (str): The Sui address of the owner
        vault_id (str): The vault identifier (can be vault_address, coin_type, or lp_type)
    Returns:
        float: The LP token balance for the owner in the specified vault
    """
    config = load_config()
    sui_api_url = config["sui_api_url"]
    vaults = config["vaults"]

    # Find the vault entry by vault_id (match against vault_address, coin_type, or lp_type)
    vault = next((v for v in vaults if vault_id in (v["vault_address"], v["coin_type"], v["lp_type"])), None)
    if not vault:
        raise ValueError(f"Vault not found for id: {vault_id}")
    lp_type = vault["lp_type"]

    async with aiohttp.ClientSession() as session:
        owned_objects = await get_owned_objects(session, sui_api_url, owner)
        # Filter for objects matching the LP token type
        lp_objects = [obj for obj in owned_objects if obj.get('data', {}).get('type') == lp_type]
        logger.debug("Number of LP objects: %s", len(lp_objects))
        logger.debug("Filtered LP objects: %s", lp_objects)
        # Sum balances from object fields
        total = 0
        for obj in lp_objects:
            try:
                balance = int(obj['data']['content']['fields'].get('balance', 0))
                total += balance
            except Exception:
                continue
        return float(total)
