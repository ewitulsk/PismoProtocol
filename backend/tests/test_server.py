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
    
    @patch('server.calc_total_account_value')
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
            "0xsample_owner", "0xsample_account", "0xsample_contract"
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
    
    @patch('server.calc_total_vault_values')
    def test_calculate_total_value_locked(self, mock_calc):
        # Configure mock to return a predefined value
        mock_calc.return_value = {
            "totalValueLocked": 9876.54,
            "vaults": [
                {
                    "type": "0xpackage::lp::Vault<0xpackage::coin::COIN, 0xpackage::coin::COIN>",
                    "coin": 1000.0,
                    "coin_type": "0xpackage::coin::COIN",
                    "value": 5000.0
                },
                {
                    "type": "0xpackage::lp::Vault<0xpackage::token::TOKEN, 0xpackage::token::TOKEN>",
                    "coin": 500.0,
                    "coin_type": "0xpackage::token::TOKEN",
                    "value": 4876.54
                }
            ],
            "count": 2
        }
        
        # Make request to the endpoint
        response = self.app.post(
            '/api/calculateTotalValueLocked',
            content_type='application/json'
        )
        
        # Parse response
        data = json.loads(response.data)
        
        # Assertions
        self.assertEqual(response.status_code, 200)
        self.assertEqual(data["totalValueLocked"], 9876.54)
        self.assertEqual(len(data["vaults"]), 2)
        self.assertEqual(data["count"], 2)
        mock_calc.assert_called_once()
    
    @patch('server.calc_total_vault_values')
    def test_calculate_total_value_locked_error(self, mock_calc):
        # Configure mock to raise an exception
        mock_calc.side_effect = ValueError("Configuration error")
        
        # Make request to the endpoint
        response = self.app.post(
            '/api/calculateTotalValueLocked',
            content_type='application/json'
        )
        
        # Parse response
        data = json.loads(response.data)
        
        # Assertions
        self.assertEqual(response.status_code, 400)
        self.assertTrue("error" in data)
        self.assertEqual(data["error"], "Configuration error")
        mock_calc.assert_called_once()
    
    @patch('server.calc_total_vault_values')
    def test_calculate_total_value_locked_exception(self, mock_calc):
        # Configure mock to raise an unexpected exception
        mock_calc.side_effect = Exception("Unexpected error")
        
        # Make request to the endpoint
        response = self.app.post(
            '/api/calculateTotalValueLocked',
            content_type='application/json'
        )
        
        # Parse response
        data = json.loads(response.data)
        
        # Assertions
        self.assertEqual(response.status_code, 500)
        self.assertTrue("error" in data)
        self.assertTrue("Failed to calculate total value locked" in data["error"])
        mock_calc.assert_called_once()

if __name__ == '__main__':
    unittest.main()
