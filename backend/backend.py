import requests, re
from typing import Dict

def get_owned_objects(network: str, owner: str) -> list:
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


def get_collateral_objects(network:str, owner: str, contract_address: str) -> list:
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


def form_collateral_triples(network: str, owner: str, contract_address: str) -> list:
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


def get_price_feed(feed_id: str) -> Dict:
    """
    Use Pyth API to get the price feed updates
    """

    query_args = f"ids%5B%5D={feed_id}"


    response = requests.get(f'https://hermes.pyth.network/v2/updates/price/latest?{query_args}')
    print(response.json()['parsed'])
    return response.json()['parsed']
