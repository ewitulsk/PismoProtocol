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
    get_program_objects,
    get_price_feed,
    calc_total_account_value
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
            result = await get_program_objects(session, 'testnet', ['0xsample_program_id'])
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
            result = await get_price_feed(session, '0xsample_feed_id')
            await session.close()
            return result
        
        loop = asyncio.get_event_loop()
        result = loop.run_until_complete(run_test())
        
        # Assertions
        self.assertEqual(result, self.mock_data["price_feed_response"]["parsed"][0])
    
    @patch('async_backend.form_coin_type_prgm_triples')
    @patch('async_backend.get_program_objects')
    @patch('async_backend.get_price_feed')
    def test_calc_total_account_value_async(self, mock_get_price, mock_get_program, mock_form_triples):
        # Configure mocks
        mock_form_triples.return_value = self.mock_data["collateral_triples"]
        mock_get_program.return_value = self.mock_data["program_objects"]
        mock_get_price.return_value = self.mock_data["price_feed_response"]["parsed"][0]
        
        # Run the coroutine
        async def run_test():
            result = await calc_total_account_value('testnet', '0xsample_owner', '0xsample_account', '0xsample_contract')
            return result
        
        loop = asyncio.get_event_loop()
        result = loop.run_until_complete(run_test())
        
        # Assertion - verify the function returns a value
        self.assertIsInstance(result, float)

if __name__ == '__main__':
    unittest.main()
