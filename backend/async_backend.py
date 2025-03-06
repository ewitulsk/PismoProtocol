import aiohttp
import asyncio
import re
from typing import Dict, List, Any

async def get_owned_objects(session: aiohttp.ClientSession, network: str, owner: str) -> List:
    """
    Asynchronously retrieve owned objects for a given owner on a specified network.
    """
    request = {
        "jsonrpc": "2.0",
        "id": 1,
        "method": "suix_getOwnedObjects",
        "params": [
            owner,
            {
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
        ]
    }
    
    async with session.post(f'https://fullnode.{network}.sui.io:443', json=request) as response:
        result = await response.json()
        owned_objects = result['result']['data']
        return owned_objects

async def get_collateral_objects(session: aiohttp.ClientSession, network: str, owner: str, account: str, contract_address: str) -> List:
    """
    Asynchronously retrieve collateral objects owned by a specified owner.
    """
    owned_objects = await get_owned_objects(session, network, owner)
    collateral_objects = []
    
    type_regex = rf"{contract_address}\w*::collateral::Collateral<(0x\w*::\S*::\S*)>"
    
    for obj in owned_objects:
        collateral_match = re.match(type_regex, obj['data']['type'])
        if not collateral_match:
            continue
        elif obj['data']['content']['fields']['account_id'] == account:
            collateral_objects.append(obj)
            
    return collateral_objects

async def form_coin_type_prgm_triples(session: aiohttp.ClientSession, network: str, owner: str, account: str, contract_address: str) -> List:
    """
    Asynchronously form triples that contain the "coin", "type", and "program_id" values from the collateral objects.
    """
    triples = []
    collateral_objects = await get_collateral_objects(session, network, owner, account, contract_address)
    for obj in collateral_objects:
        data = obj['data']
        triple = {
            "coin": data['content']['fields']['coin'],
            "type": data['type'],
            "program_id": data['content']['fields']['program_id'],
        }
        triples.append(triple)
    return triples

async def get_program_objects(session: aiohttp.ClientSession, network: str, program_ids: List) -> Dict:
    """
    Asynchronously retrieve program objects from the chain.
    """
    request = {
        "jsonrpc": "2.0",
        "id": 1,
        "method": "sui_multiGetObjects",
        "params": [
            program_ids,
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

    async with session.post(f'https://fullnode.{network}.sui.io:443', json=request) as response:
        result = await response.json()
        return result['result']

def convert_feed_bytes_to_hex_str(feed_bytes: List[int]) -> str:
    """
    Convert feed bytes to hex string.
    """
    feed_hex_str = "0x"
    for byte in feed_bytes:
        feed_hex_str += f"{byte:02x}"
    return feed_hex_str

async def get_price_feed(session: aiohttp.ClientSession, feed_id: str) -> Dict:
    """
    Asynchronously get price feed updates from Pyth API.
    """
    query_args = f"ids%5B%5D={feed_id}"
    
    async with session.get(f'https://hermes.pyth.network/v2/updates/price/latest?{query_args}') as response:
        result = await response.json()
        return result['parsed'][0]

def join_collaterals(dict_list1: List[Dict], dict_list2: List[Dict]) -> List[Dict]:
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

async def calc_total_account_value(network: str, owner: str, account: str, contract_address: str) -> float:
    """
    Asynchronously calculate the total account value.
    """
    async with aiohttp.ClientSession() as session:
        collateral_triples = await form_coin_type_prgm_triples(session, network, owner, account, contract_address)
        
        account_value = 0
        suppported_collateral_list = []
        programs_retreieved = {}
        
        for triple in collateral_triples:
            if triple['program_id'] in programs_retreieved.keys():
                continue
            programs_retreieved[triple['program_id']] = True
            
        programs = await get_program_objects(session, network, list(programs_retreieved.keys()))
        
        for program in programs:
            suppported_collateral_list += program['data']['content']['fields']['supported_collateral']
        
        joined_list = join_collaterals(collateral_triples, suppported_collateral_list)
        
        # Create a list of coroutines for concurrent execution
        price_feed_tasks = []
        for item in joined_list:
            feed_id = convert_feed_bytes_to_hex_str(item['price_feed_id_bytes'])
            price_feed_tasks.append(get_price_feed(session, feed_id))
        
        # Execute all price feed requests concurrently
        price_feed_results = await asyncio.gather(*price_feed_tasks)
        
        # Calculate the account value using the results
        for item, feed_data in zip(joined_list, price_feed_results):
            account_value += int(item['coin']) * int(feed_data['price']['price']) * pow(10, (-1 * item['token_decimals']) + feed_data['price']['expo'])
            
        return account_value
