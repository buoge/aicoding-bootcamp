import requests

API_KEY = "sk-"
BASE_URL = "https://api.moonshot.cn/v1"

print("测试 Moonshot API 连接...")
print(f"Base URL: {BASE_URL}")
print(f"API Key: {API_KEY[:10]}..." if API_KEY else "No API key!")

try:
    response = requests.get(
        f"{BASE_URL}/models",
        headers={"Authorization": f"Bearer {API_KEY}"},
        timeout=10
    )
    
    print(f"\n状态码: {response.status_code}")
    
    if response.status_code == 200:
        print("✅ API 密钥有效！")
        models = response.json()
        print(f"可用模型: {models.get('data', [])}")
    else:
        print(f"❌ API 调用失败: {response.text}")
        print("\n可能的问题:")
        print("1. API 密钥无效或已过期")
        print("2. 账户余额不足")
        print("3. API 服务暂时不可用")
        
except Exception as e:
    print(f"❌ 连接失败: {e}")

