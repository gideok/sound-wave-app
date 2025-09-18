# backend/main.py

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# Import routers
from routers.render import router as render_router
from routers.stems import router as stems_router
from routers.score import router as score_router
from routers.lyrics import router as lyrics_router
from routers.audio import router as audio_router

app = FastAPI()

# CORS 설정: 프론트엔드 개발 서버(http://localhost:5173)에서의 요청을 허용
origins = [
	"http://localhost:5173",
	"http://127.0.0.1:5173",
]

app.add_middleware(
	CORSMiddleware,
	allow_origins=origins,
	allow_credentials=True,
	allow_methods=["*"], # 모든 HTTP 메소드 허용
	allow_headers=["*"], # 모든 HTTP 헤더 허용
)

@app.get("/")
def read_root():
	return {"Hello": "World"}

@app.get("/api/status")
def get_status():
	return {"status": "ok", "message": "Backend is running!"}

# Include all routers
app.include_router(render_router, prefix="/api")
app.include_router(stems_router, prefix="/api")
app.include_router(score_router, prefix="/api")
app.include_router(lyrics_router, prefix="/api")
app.include_router(audio_router, prefix="/api")

if __name__ == "__main__":
	import uvicorn
	uvicorn.run(app, host="0.0.0.0", port=8000, lifespan="off")