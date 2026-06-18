# 糖尿病饮食推荐 - 前后端分离

```
frontend/   React 前端 → VS Code 打开
backend/    Python 后端 → PyCharm / VS Code 打开
```

## 启动

**后端**（先启动）
```powershell
cd backend
pip install -r requirements.txt
python -m uvicorn main:app --reload --port 8000
```

**前端**
```powershell
cd frontend
npm install
npm run dev
```

- 前端：http://localhost:5173 （饮食推荐）
- 前端实验室：http://localhost:5173/lab （模型训练与评估）
- 后端：http://localhost:8000

AI 密钥配置：`backend/.env`
