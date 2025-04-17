import asyncio
from async_backend import get_lp_balance

async def test():
    owner = "0xab8d1b5a5311c9400e3eaf5c3b641f10fb48b43cc30d365fa8a98a6ca6bd4865"
    vault_id = "0x815436a2eac2aa5e7dcb93c8c61df0c21c19afb9569f5f2128d85773525510bd"
    balance = await get_lp_balance(owner, vault_id)
    print(f"LP balance for owner {owner} in vault {vault_id}: {balance}")

if __name__ == "__main__":
    asyncio.run(test())
