from flask import Flask, request, jsonify
from flask_cors import CORS
import asyncio
import concurrent.futures
from functools import wraps

from async_backend import (
    calc_total_account_value,
    calc_total_vault_values
)

app = Flask(__name__)
CORS(app)

# Create a new executor for CPU-bound tasks
executor = concurrent.futures.ThreadPoolExecutor(max_workers=5)

# Utility to run async functions in Flask
def async_route(f):
    @wraps(f)
    def wrapper(*args, **kwargs):
        loop = asyncio.new_event_loop()
        try:
            return loop.run_until_complete(f(*args, **kwargs))
        finally:
            loop.close()
    return wrapper

@app.route('/api/calculateTotalAccountValue', methods=['POST'])
@async_route
async def calculate_total_account_value():
    try:
        data = request.get_json()
        if data is None:
            return jsonify({"error": "Invalid JSON data"}), 400
        
        if not data.get('address') or not data.get('account') or not data.get('contract'):
            return jsonify({"error": "Missing required parameters: address, account, and contract"}), 400
        
        # Get parameters
        network = data.get('network', 'testnet')  # Default to testnet if not specified
        address = data.get('address')
        account = data.get('account')
        contract = data.get('contract')
        
        # Use the async version of the calculation function
        total_value = await calc_total_account_value(address, account, contract)
        
        return jsonify({"totalValue": total_value}), 200
    
    except Exception as e:
        print(f"Error calculating total account value: {str(e)}")
        return jsonify({"error": f"Failed to calculate total account value: {str(e)}"}), 500
    

@app.route('/api/calculateTotalValueLocked', methods=['POST'])
@async_route
async def calculate_total_value_locked():
    try:
        # Calculate total value locked using config-based vault addresses
        result = await calc_total_vault_values()
        
        return jsonify(result), 200
    
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    except Exception as e:
        print(f"Error calculating total value locked: {str(e)}")
        return jsonify({"error": f"Failed to calculate total value locked: {str(e)}"}), 500
    

if __name__ == "__main__":
    app.run(host='0.0.0.0', port=5000, debug=True)
