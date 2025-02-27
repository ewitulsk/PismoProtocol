from backend import (
    get_collateral_objects,
    form_collateral_triples,
    get_price_feed,
    get_program_objects,
    convert_feed_bytes_to_hex_str,
    join_collaterals,
    calc_total_account_value
)


#get_collateral_objects("testnet", "0xab8d1b5a5311c9400e3eaf5c3b641f10fb48b43cc30d365fa8a98a6ca6bd4865", "0x1b04601c7395809e6dbbc257b34f8efefec880b2513381ad402ee0a747c3b4d6")
#collateral_objects = form_collateral_triples("testnet", "0xab8d1b5a5311c9400e3eaf5c3b641f10fb48b43cc30d365fa8a98a6ca6bd4865", "0x1b04601c7395809e6dbbc257b34f8efefec880b2513381ad402ee0a747c3b4d6")
#print(collateral_objects)
#print("\n")


test_program = get_program_objects('testnet', ["0x0b1d689f27aceb76dc8345ac6dd361c5e883415486d603e2a07986b0b0ad8c8a"])
#print(test_program)
#print("\n")


feed_id = convert_feed_bytes_to_hex_str([35, 215, 49, 81, 19, 245, 177, 211, 186, 122, 131, 96, 76, 68, 185, 77, 121, 244, 253, 105, 175, 119, 248, 4, 252, 127, 146, 10, 109, 198, 87, 68])
feed_data = get_price_feed(feed_id)
#print(feed_data)


collateral_objects= [{'coin': '100', 
                      'type': '0x1b04601c7395809e6dbbc257b34f8efefec880b2513381ad402ee0a747c3b4d6::collateral::Collateral<0x1b04601c7395809e6dbbc257b34f8efefec880b2513381ad402ee0a747c3b4d6::test_coin::TEST_COIN>',
                      'program_id': '0x0b1d689f27aceb76dc8345ac6dd361c5e883415486d603e2a07986b0b0ad8c8a'
                    }]

supported_collateral = [{'type': '0x1b04601c7395809e6dbbc257b34f8efefec880b2513381ad402ee0a747c3b4d6::programs::CollateralIdentifier',
                         'fields': {
                            'price_feed_id_bytes': [35, 215, 49, 81, 19, 245, 177, 211, 186, 122, 131, 96, 76, 68, 185, 77, 121, 244, 253, 105, 175, 119, 248, 4, 252, 127, 146, 10, 109, 198, 87, 68], 
                            'token_decimals': 10, 
                            'token_info': '1b04601c7395809e6dbbc257b34f8efefec880b2513381ad402ee0a747c3b4d6::test_coin::TEST_COIN'
                            }
                        }]

#print(join_collaterals(collateral_objects, supported_collateral))
#print("\n")

#print(calc_total_account_value("testnet", "0xab8d1b5a5311c9400e3eaf5c3b641f10fb48b43cc30d365fa8a98a6ca6bd4865", "0x1b04601c7395809e6dbbc257b34f8efefec880b2513381ad402ee0a747c3b4d6"))

#print(get_collateral_objects("testnet", "0xab8d1b5a5311c9400e3eaf5c3b641f10fb48b43cc30d365fa8a98a6ca6bd4865", "0x060d821b7c1a3a003d7c66931818123ea092b2dc6ec619a6ef8bda415f49bbda", "0xd5af04e89698e14fce936f81c35f870c600495e9dc3cc388ffeff53b6133744c"))
print(calc_total_account_value("testnet", "0xab8d1b5a5311c9400e3eaf5c3b641f10fb48b43cc30d365fa8a98a6ca6bd4865", "0x060d821b7c1a3a003d7c66931818123ea092b2dc6ec619a6ef8bda415f49bbda", "0xd5af04e89698e14fce936f81c35f870c600495e9dc3cc388ffeff53b6133744c"))