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


def get_collateral_objects(network:str, owner: str, contract_address: str) -> List:
    """
    Retrieves a list of collateral objects owned by a specified owner on a given network.
    Args:
        network (str): The network on which to search for owned objects.
        owner (str): The owner whose objects are to be retrieved.
        contract_address (str): The contract address on which collateral objects are filtered.
    Returns:
        list: A list of collateral objects owned by the specified owner.
    """

    collateral_objects = []
    owned_objects = get_owned_objects(network, owner)

    # regex expression for the type
    type_regex = rf"{contract_address}\w*::collateral::Collateral<(0x\w*::\S*::\S*)>"

    for obj in owned_objects:
        collateral_match = re.match(type_regex, obj['data']['type'])
        if collateral_match:
            collateral_objects.append(obj)
            #print(obj['data']['type'])
            #print(collateral_match.group(1))
    #print(collateral_objects)
    return collateral_objects


def form_collateral_triples(network: str, owner: str, contract_address: str) -> List:
    triples = []
    collateral_objects = get_collateral_objects(network, owner, contract_address)
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


def get_program_object(network: str, program_id: str) -> Dict:
    """
    Retrieve a program object from the chain.
    Args:
        network (str): The network on which the program is located.
        program_id (str): The identifier of the program to retrieve.
    Returns:
        dict: The program object.
    """

    request = {
        "jsonrpc": "2.0",
        "id": 1,
        "method": "sui_getObject",
        "params": [
            program_id,
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
    return response.json()['result']['data']


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
    #print(response)
    #print(response.json()['parsed'])
    return response.json()['parsed']


def join_collaterals(dict_list1: List[Dict], dict_list2: List[Dict]) -> List[Dict]:
    """
    Perform an inner join between two lists of dictionaries based on specified keys.
    Args:
        dict_list1 (List[Dict]): The list of collateral objects.
        dict_list2 (List[Dict]): The list of supported collateral for the program.
    Returns:
        List[Dict]: A list of dictionaries containing the joined data.
    """

    dict2_lookup = {"0x" + item['fields']['token_info']: item['fields'] for item in dict_list2}
    joined_list = []
    
    for item1 in dict_list1:
        match = re.match(r"\w*::collateral::Collateral<(0x\w*::\S*::\S*)>", item1['type'])
        if match and match.group(1) in dict2_lookup:
            joined_item = {**item1, **dict2_lookup[match.group(1)]}
            joined_list.append(joined_item)
    
    return joined_list