# FIG to TOK (Figma Variables → Tokens/SCSS)

Figma 파일의 Variables & Styles를 **W3C Design Tokens(JSON)** 과 **Sass 변수(SCSS)** 로 추출하는 플러그인.

## ✨ Features
- Variables → W3C 토큰(`core/semantic/$themes`)
- Styles → typography/shadows 매핑
- **SCSS 내보내기** (semantic은 모드별 접미사)
- 창 크기 기억 / UI 드래그 리사이즈
- 대용량 JSON 청크 전송, SCSS 단일 전송

## 📦 Install (개발자)
```bash
npm i
npm run dev   # esbuild watch (dist/code.js 생성)
# 또는
npm run build # 단발 빌드