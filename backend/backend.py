import requests, re
from typing import Dict, List

def get_owned_objects(network: str, owner: str) -> List:
    """
    Retrieve a list of owned objects for a given owner on a specified network.
    Args:
        network (str): The network to query (e.g., 'mainnet', 'testnet').
        owner (str): The identifier of the owner whose objects are to be retrieved.
    Returns:
        list: A list of owned objects.
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

    
    response = requests.post(f'https://fullnode.{network}.sui.io:443', json=request)
    #print(response.json())

    owned_objects = response.json()['result']['data']
    #print(owned_objects)
    return owned_objects


def get_collateral_objects(network: str, owner: str, account: str, contract_address: str) -> List:
    """
    Retrieves a list of collateral objects owned by a specified owner on a given network.
    Args:
        network (str): The network on which to search for owned objects.
        owner (str): The owner whose objects are to be retrieved.
        account (str): The account identifier to filter collateral objects.
        contract_address (str): The contract address on which collateral objects are filtered.
    Returns:
        list: A list of collateral objects owned by the specified owner.
    """

    collateral_objects = []
    owned_objects = get_owned_objects(network, owner)
    #print(f"OWNED_OBJECTS: {owned_objects}")

    # regex expression for the type
    type_regex = rf"{contract_address}\w*::collateral::Collateral<(0x\w*::\S*::\S*)>"

    for obj in owned_objects:
        #print(obj['data']['type'])
        collateral_match = re.match(type_regex, obj['data']['type'])
        if not collateral_match:
            continue
        elif obj['data']['content']['fields']['account_id'] == account:
            #print(collateral_match.group(1))
            #print("MATCH")
            collateral_objects.append(obj)
            
            
    #print(f"COLLATERAL_OBJECTS: {collateral_objects}")
    return collateral_objects


def form_collateral_triples(network: str, owner: str, account: str, contract_address: str) -> List:
    triples = []
    collateral_objects = get_collateral_objects(network, owner, account, contract_address)
    for obj in collateral_objects:
        data = obj['data']
        triple = {
            "coin": data['content']['fields']['coin'],
            "type": data['type'],
            "program_id": data['content']['fields']['program_id'],
        }
        triples.append(triple)
        #print(triples)
    return triples


def get_program_objects(network: str, program_ids: List) -> Dict:
    """
    Retrieve a program object from the chain.
    Args:
        network (str): The network on which the program is located.
        program_ids (List): The list of program_id values to pass to the API.
    Returns:
        dict: The program object.
    """

    #print("PROGRAM_IDS: ", program_ids)
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


    response = requests.post(f'https://fullnode.{network}.sui.io:443', json=request)
    #print(response.json())
    return response.json()['result']


def convert_feed_bytes_to_hex_str(feed_bytes: List[int]) -> str:
    feed_hex_str = "0x"
    for byte in feed_bytes:
        #print("APPENDING: ", hex(byte)[2:])
        feed_hex_str += f"{byte:02x}"
    #print(feed_hex_str)
    return feed_hex_str
    

def get_price_feed(feed_id: str) -> Dict:
    """
    Use Pyth API to get the price feed updates
    """

    query_args = f"ids%5B%5D={feed_id}"

    response = requests.get(f'https://hermes.pyth.network/v2/updates/price/latest?{query_args}')
    #print(response.json())
    #print(response.json()['parsed'][0])
    return response.json()['parsed'][0]


def join_collaterals(dict_list1: List[Dict], dict_list2: List[Dict]) -> List[Dict]:
    """
    Perform an inner join between two lists of dictionaries based on specified keys.
    Args:
        dict_list1 (List[Dict]): The list of collateral objects.
        dict_list2 (List[Dict]): The list of supported collateral for the program.
    Returns:
        List[Dict]: A list of dictionaries containing the joined data.
    """
    #print("DICT_LIST2")
    #print(dict_list2)
    dict2_lookup = {"0x" + item['fields']['token_info']: item['fields'] for item in dict_list2}
    joined_list = []
    
    for item1 in dict_list1:
        match = re.match(r"\w*::collateral::Collateral<(0x\w*::\S*::\S*)>", item1['type'])
        if match and match.group(1) in dict2_lookup:
            joined_item = {**item1, **dict2_lookup[match.group(1)]}
            joined_list.append(joined_item)
    
    return joined_list


def calc_total_account_value(network: str, owner: str, account: str, contract_address: str) -> float:
    collateral_triples = form_collateral_triples(network, owner, account, contract_address)
    #print(f"COLLATERAL TRIPLES:\n{collateral_triples}\n")
    account_value = 0
    suppported_collateral_list = []
    programs_retreieved = {}
    for triple in collateral_triples:
        #print("PROGRAM ID: ", triple['program_id'])
        if triple['program_id'] in programs_retreieved.keys():
            #print(f"SKIPPING PROGRAM: {triple['program_id']}")
            continue
        programs_retreieved[triple['program_id']] = True
    programs = get_program_objects(network, list(programs_retreieved.keys()))
    for program in programs:
        #print(f"PROGRAM:\n{program}\n")
        suppported_collateral_list += program['data']['content']['fields']['supported_collateral']
    #print(f"SUPPORTED COLLATERAL LIST:\n{suppported_collateral_list}\n")

    joined_list = join_collaterals(collateral_triples, suppported_collateral_list)
    for item in joined_list:
        #print(f"ITEM:\n{item}\n")
        feed_id = convert_feed_bytes_to_hex_str(item['price_feed_id_bytes'])
        feed_data = get_price_feed(feed_id)
        #print(f"FEED DATA:\n{feed_data}\n")
        account_value += int(item['coin']) * int(feed_data['price']['price']) * pow(10, (-1 * item['token_decimals']) + feed_data['price']['expo'])

    return account_value