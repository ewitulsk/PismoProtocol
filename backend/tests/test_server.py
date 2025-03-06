import unittest
from unittest.mock import patch, MagicMock
import sys
import os
import json

# Add parent directory to path so we can import server module
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from server import app

class TestServerEndpoints(unittest.TestCase):
    
    def setUp(self):
        app.testing = True
        self.app = app.test_client()
        
        # Load test data from mock_data.json
        with open(os.path.join(os.path.dirname(__file__), 'mock_data.json'), 'r') as f:
            self.mock_data = json.load(f)
    
    @patch('server.calc_total_account_value_async')
    def test_calculate_total_account_value(self, mock_calc):
        # Configure mock to return a predefined value
        mock_calc.return_value = 1234.56
        
        # Test data
        test_request_data = {
            "network": "testnet",
            "address": "0xsample_owner",
            "account": "0xsample_account",
            "contract": "0xsample_contract"
        }
        
        # Make request to the endpoint
        response = self.app.post(
            '/api/calculateTotalAccountValue',
            json=test_request_data,
            content_type='application/json'
        )
        
        # Parse response
        data = json.loads(response.data)
        
        # Assertions
        self.assertEqual(response.status_code, 200)
        self.assertEqual(data["totalValue"], 1234.56)
        mock_calc.assert_called_once_with(
            "testnet", "0xsample_owner", "0xsample_account", "0xsample_contract"
        )
    
    def test_calculate_total_account_value_missing_params(self):
        # Test with missing required parameters
        response = self.app.post(
            '/api/calculateTotalAccountValue',
            json={"network": "testnet"},  # Missing address, account, contract
            content_type='application/json'
        )
        
        # Parse response
        data = json.loads(response.data)
        
        # Assertions
        self.assertEqual(response.status_code, 400)
        self.assertTrue("error" in data)
    
    @patch('server.calc_total_account_value')
    def test_calculate_total_account_value_sync(self, mock_calc):
        # Configure mock to return a predefined value
        mock_calc.return_value = 1234.56
        
        # Test data
        test_request_data = {
            "network": "testnet",
            "address": "0xsample_owner",
            "account": "0xsample_account",
            "contract": "0xsample_contract"
        }
        
        # Make request to the endpoint
        response = self.app.post(
            '/api/calculateTotalAccountValueSync',
            json=test_request_data,
            content_type='application/json'
        )
        
        # Parse response
        data = json.loads(response.data)
        
        # Assertions
        self.assertEqual(response.status_code, 200)
        self.assertEqual(data["totalValue"], 1234.56)
        mock_calc.assert_called_once_with(
            "testnet", "0xsample_owner", "0xsample_account", "0xsample_contract"
        )

if __name__ == '__main__':
    unittest.main()
