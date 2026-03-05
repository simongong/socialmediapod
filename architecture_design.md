# Drama Reader - Architecture Design Document

## 1. System Overview
The Drama Reader system is divided into two primary subsystems designed to evolve independently:
1. **Frontend (Chrome Extension):** Handles DOM parsing, UI presentation, sequence management, and communicating with the local audio backend.
2. **Backend (FastAPI):** Handles Audio Synthesis (Deep Learning TTS Models via PyTorch/MPS).

## 2. Component Architecture

### 2.1 Chrome Extension (`manifest.json` V3)
* **Manifest Layer:** Configured for Manifest V3 standard, utilizing the `activeTab` permission to execute `content.js` strictly on matched domains (`*.twitter.com`, `x.com`, `*.reddit.com`, `reddit.com`).
* **UI Controller (`content.js`):**
  * Injects a fixed `div` overlay containing a minimalist playback controller.
  * Manages global state (`isPlaying`, `currentPlaylist`).
* **DOM Extractors:**
  * **Twitter Engine:** Searches for `[data-testid="tweet"]`, extracting `User-Name` and `tweetText`.
  * **Reddit Engine:** Supports modern Web Components (`<shreddit-post>`, `<shreddit-comment>`) and deeply nested paragraph tags (`<p>`), falling back to classic `.comment` node tree traversal.
* **Audio Sequence Managers (`playSequence`):** Asynchronously fetches `.wav` blobs representing the speech synthesis from the backend, wraps them in `URL.createObjectURL` mapped to an `HTMLAudioElement`, and chains sequential playback via `audio.onended`.

### 2.2 FastAPI Backend (Local Service)
* **Server Layer (`main.py`):** Uses `uvicorn` and `FastAPI` to provision a local `localhost:8000` service. Needs CORS enabled (`CORSMiddleware`) for the Chrome Extension to access it.
* **Model Inference:** Exposes `POST /synthesize`. Expects `{"author": "str", "text": "str"}` payload.
* **Actor Cast Allocation:** Implements a stable hashing block on the author's screen name (`MD5(author) % len(VOICES)`). This ensures the same user always maps to the same voice ID (e.g., `kokoro_female_1`).
* **Response Handling:** Outputs standard raw PCM Wave (`audio/wav`) via `io.BytesIO` streams, eliminating the need to write temporary files to the disk.

## 3. Data Flow
1. User clicks **▶ Play**.
2. Extension parses DOM -> `[{author: 'Creator', text: 'Hello'}, ...]`.
3. Extension invokes `playSequence(0)`.
4. Browser executes an explicit `POST /synthesize` to `localhost:8000`.
5. FastAPI allocates a voice ID based securely on the author hash.
6. FastAPI PyTorch/MPS Backend synthesizes raw audio -> WAV Bytes.
7. Backend returns HTTP 200 `audio/wav`.
8. Extension converts stream to Local Blob Instance -> `createObjectURL`.
9. `HTMLAudioElement` fetches Blob, starts playback.
10. `onended` event fires -> Extension increments index -> Recursion to Step 4.
