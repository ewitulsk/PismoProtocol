import asyncio
from async_backend import calc_total_vault_values, load_config

async def test():
    # Load config to show available settings
    config = load_config()
    print(f"Using config: SUI_API_URL={config['sui_api_url']}, Contract={config['contract_address']}")
    print(f"Vault addresses: {len(config['vault_addresses'])}")
    
    # Call without specifying network (will use config's network)
    result = await calc_total_vault_values()
    print(f"Total vault values: {result}")

if __name__ == "__main__":
    asyncio.run(test())
