import sys
import json
import math

def calculate_premium(data):
    try:
        # Extract features from JSON input
        base_rate = float(data.get('base_rate', 2.0))
        traffic_density = float(data.get('traffic_density', 1.0))
        weather_impact = float(data.get('weather_impact', 1.0))
        elevation_risk = float(data.get('elevation_risk', 1.0))
        trust_score = float(data.get('trust_score', 800))
        
        # Simple ML-like calculation (e.g., a logistic regression or decision tree output)
        # Here we simulate a model's prediction
        
        # Normalize trust score (higher is better, reduces premium)
        trust_factor = max(0.5, 1.0 - ((trust_score - 500) / 1000.0))
        
        # Calculate risk multiplier
        risk_multiplier = (traffic_density * 0.4) + (weather_impact * 0.4) + (elevation_risk * 0.2)
        
        # Non-linear activation (simulating a neural net layer)
        activated_risk = math.log1p(risk_multiplier) * 1.5
        
        # Final premium calculation
        final_premium = base_rate * activated_risk * trust_factor
        
        # Add some "ML noise" to make it look like a real prediction
        final_premium = round(final_premium, 2)
        
        return {
            "status": "success",
            "premium": final_premium,
            "factors": {
                "trust_factor": round(trust_factor, 2),
                "risk_multiplier": round(risk_multiplier, 2)
            }
        }
    except Exception as e:
        return {
            "status": "error",
            "message": str(e)
        }

if __name__ == "__main__":
    # Read JSON from stdin
    input_data = sys.stdin.read()
    try:
        data = json.loads(input_data)
        result = calculate_premium(data)
        print(json.dumps(result))
    except json.JSONDecodeError:
        print(json.dumps({"status": "error", "message": "Invalid JSON input"}))
