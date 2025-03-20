import unittest
import asyncio
from unittest.mock import patch, MagicMock
import sys
import os
import json
import aiohttp

# Add parent directory to path so we can import backend modules
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from async_backend import (
    get_owned_objects,
    get_collateral_objects,
    form_coin_type_prgm_triples,
    get_objects,
    get_price_feed,
    calc_total_account_value,
    parse_vault_token_type,
    calc_total_vault_values  # Add the new function
)

class AsyncMock(MagicMock):
    async def __call__(self, *args, **kwargs):
        return super(AsyncMock, self).__call__(*args, **kwargs)

class TestAsyncBackendFunctions(unittest.TestCase):
    
    def setUp(self):
        # Load test data from mock_data.json
        with open(os.path.join(os.path.dirname(__file__), 'mock_data.json'), 'r') as f:
            self.mock_data = json.load(f)
    
    @patch('aiohttp.ClientSession.post')
    def test_get_owned_objects_async(self, mock_post):
        # Configure mock
        mock_cm = MagicMock()
        mock_response = AsyncMock()
        mock_response.json.return_value = self.mock_data["owned_objects_response"]
        mock_cm.__aenter__.return_value = mock_response
        mock_post.return_value = mock_cm
        
        # Run the coroutine
        async def run_test():
            session = aiohttp.ClientSession()
            result = await get_owned_objects(session, 'testnet', '0xsample_owner')
            await session.close()
            return result
        
        loop = asyncio.get_event_loop()
        result = loop.run_until_complete(run_test())
        
        # Assertions
        self.assertEqual(result, self.mock_data["owned_objects_response"]["result"]["data"])
    
    @patch('async_backend.get_owned_objects')
    def test_get_collateral_objects_async(self, mock_get_owned):
        # Configure mock
        mock_get_owned.return_value = self.mock_data["owned_objects_response"]["result"]["data"]
        
        # Run the coroutine
        async def run_test():
            session = aiohttp.ClientSession()
            result = await get_collateral_objects(session, 'testnet', '0xsample_owner', '0xsample_account', '0xsample_contract')
            await session.close()
            return result
        
        loop = asyncio.get_event_loop()
        result = loop.run_until_complete(run_test())
        
        # Assertions
        self.assertEqual(len(result), 1)
        self.assertEqual(result[0]["data"]["content"]["fields"]["account_id"], "0xsample_account")
    
    @patch('async_backend.get_collateral_objects')
    def test_form_coin_type_prgm_triples_async(self, mock_get_collateral):
        # Configure mock
        mock_get_collateral.return_value = [self.mock_data["collateral_object"]]
        
        # Run the coroutine
        async def run_test():
            session = aiohttp.ClientSession()
            result = await form_coin_type_prgm_triples(session, 'testnet', '0xsample_owner', '0xsample_account', '0xsample_contract')
            await session.close()
            return result
        
        loop = asyncio.get_event_loop()
        result = loop.run_until_complete(run_test())
        
        # Assertions
        self.assertEqual(len(result), 1)
        self.assertEqual(result[0]["coin"], "100")
        self.assertEqual(result[0]["program_id"], "0xsample_program_id")
    
    @patch('aiohttp.ClientSession.post')
    def test_get_program_objects_async(self, mock_post):
        # Configure mock
        mock_cm = MagicMock()
        mock_response = AsyncMock()
        mock_response.json.return_value = {"result": self.mock_data["program_objects"]}
        mock_cm.__aenter__.return_value = mock_response
        mock_post.return_value = mock_cm
        
        # Run the coroutine
        async def run_test():
            session = aiohttp.ClientSession()
            result = await get_objects(session, 'testnet', ['0xsample_program_id'])
            await session.close()
            return result
        
        loop = asyncio.get_event_loop()
        result = loop.run_until_complete(run_test())
        
        # Assertions
        self.assertEqual(result, self.mock_data["program_objects"])
    
    @patch('aiohttp.ClientSession.get')
    def test_get_price_feed_async(self, mock_get):
        # Configure mock
        mock_cm = MagicMock()
        mock_response = AsyncMock()
        mock_response.json.return_value = self.mock_data["price_feed_response"]
        mock_cm.__aenter__.return_value = mock_response
        mock_get.return_value = mock_cm
        
        # Run the coroutine
        async def run_test():
            session = aiohttp.ClientSession()
            # Include the pyth URL parameter
            pyth_url = "https://hermes.pyth.network/v2/updates/price/latest?"
            result = await get_price_feed(session, '0xsample_feed_id', pyth_url)
            await session.close()
            return result
        
        loop = asyncio.get_event_loop()
        result = loop.run_until_complete(run_test())
        
        # Assertions
        self.assertEqual(result, self.mock_data["price_feed_response"]["parsed"][0])
    
    @patch('async_backend.form_coin_type_prgm_triples')
    @patch('async_backend.get_objects')
    @patch('async_backend.get_price_feed')
    @patch('async_backend.load_config')
    def test_calc_total_account_value_async(self, mock_load_config, mock_get_price, mock_get_program, mock_form_triples):
        # Configure mocks
        mock_load_config.return_value = {
            "sui_api_url": "https://fullnode.testnet.sui.io:443",
            "contract_address": "0xsample_contract",
            "pyth_price_feed_url": "https://hermes.pyth.network/v2/updates/price/latest?"
        }
        mock_form_triples.return_value = self.mock_data["collateral_triples"]
        mock_get_program.return_value = self.mock_data["program_objects"]
        mock_get_price.return_value = self.mock_data["price_feed_response"]["parsed"][0]
        
        # Run the coroutine
        async def run_test():
            result = await calc_total_account_value('0xsample_owner', '0xsample_account', '0xsample_contract')
            return result
        
        loop = asyncio.get_event_loop()
        result = loop.run_until_complete(run_test())
        
        # Assertion - verify the function returns a value
        self.assertIsInstance(result, float)
    
    @patch('async_backend.get_objects')
    @patch('async_backend.get_price_feed')
    @patch('async_backend.load_config')
    def test_calc_total_vault_values_async(self, mock_load_config, mock_get_price, mock_get_objects):
        # Configure mocks
        mock_load_config.return_value = {
            "sui_api_url": "https://fullnode.testnet.sui.io:443",
            "vault_addresses": ["0xvault1", "0xvault2"],
            "contract_global": "0xglobal_address",
            "pyth_price_feed_url": "https://hermes.pyth.network/v2/updates/price/latest?"
        }
        
        # Mock get_objects to return vault objects and global object
        def mock_get_objects_side_effect(session, sui_api_url, addresses):
            if "0xglobal_address" in addresses:
                return [self.mock_data["global_object"]]
            else:
                return self.mock_data["vault_objects"]
        
        mock_get_objects.side_effect = mock_get_objects_side_effect
        
        # Update the mock_get_price to return the correct price feed response
        mock_get_price.return_value = {
            "price": {
                "price": "10000000",
                "expo": -8
            }
        }
        
        # Run the coroutine
        async def run_test():
            result = await calc_total_vault_values()
            return result
        
        loop = asyncio.get_event_loop()
        result = loop.run_until_complete(run_test())
        
        # Assertions
        self.assertIn("totalValueLocked", result)
        self.assertIn("vaults", result)
        self.assertIn("count", result)
        self.assertIsInstance(result["totalValueLocked"], float)
        self.assertIsInstance(result["vaults"], list)
        self.assertIsInstance(result["count"], int)
    
    @patch('async_backend.load_config')
    def test_calc_total_vault_values_missing_config_async(self, mock_load_config):
        # Configure mock to return incomplete config - now including missing pyth URL
        mock_load_config.return_value = {
            "sui_api_url": "https://fullnode.testnet.sui.io:443",
            "vault_addresses": ["0xvault1", "0xvault2"],
            # Missing contract_global and pyth_price_feed_url
        }
        
        # Run the coroutine
        async def run_test():
            with self.assertRaises(ValueError):
                await calc_total_vault_values()
        
        loop = asyncio.get_event_loop()
        loop.run_until_complete(run_test())
    
    async def test_parse_vault_token_type(self):
        # Test valid input
        token_type = "0xaf05e950da30954a3c13a93d122390ecf8db1d26ff1de9ab6ada403f78bc84b4::lp::Vault<0xaf05e950da30954a3c13a93d122390ecf8db1d26ff1de9ab6ada403f78bc84b4::test_coin::TEST_COIN, 0xaf05e950da30954a3c13a93d122390ecf8db1d26ff1de9ab6ada403f78bc84b4::test_coin::TEST_COIN>"
        result = await parse_vault_token_type(token_type)
        
        # Assertions
        expected_coin_type = "0xaf05e950da30954a3c13a93d122390ecf8db1d26ff1de9ab6ada403f78bc84b4::test_coin::TEST_COIN"
        self.assertEqual(result, expected_coin_type)
        
        # Test with single type parameter
        token_type_single = "0xpackage::lp::Vault<0xpackage::coin::COIN>"
        result_single = await parse_vault_token_type(token_type_single)
        self.assertEqual(result_single, "0xpackage::coin::COIN")

if __name__ == '__main__':
    unittest.main()
