import hashlib
import io
import wave
import struct
import re
import soundfile as sf
import numpy as np
import gender_guesser.detector as gender
from fastapi import FastAPI, Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from consts import FEMALE_VOICES, MALE_VOICES, ALL_VOICES

try:
    from kokoro import KPipeline
    # Initialize Kokoro pipeline. We use 'a' for American English (or 'b' for British)
    # The pipeline automatically downloads model weights if missing.
    pipeline = KPipeline(lang_code='a') 
except ImportError:
    pipeline = None
    print("Warning: Kokoro library not installed or failed to load. Please pip install kokoro soundfile misaki[en] torch")

app = FastAPI(title="Drama Reader Local TTS Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], 
    allow_methods=["*"],
    allow_headers=["*"],
)

class TTSRequest(BaseModel):
    author: str
    text: str
    speed: float = 1.0

# Initialize the offline gender detector
detector = gender.Detector(case_sensitive=False)

def get_author_gender(author: str) -> str:
    """Analyze an author username/display name and predict their gender."""
    # 1. Clean up handles, remove '@'
    name = author.lstrip('@')
    
    # 2. Extract first apparent word by splitting spaces, underscores, periods, hyphens
    parts = re.split(r'[\s_.\-]+', name)
    first_part = parts[0] if parts else name
    
    # 3. If camelCase (e.g., StevenCravotta), split it into words
    camel_parts = re.findall(r'[A-Z]?[a-z]+|[A-Z]+(?=[A-Z]|$)', first_part)
    first_name = camel_parts[0] if camel_parts else first_part
    
    # 4. Filter out non-alphabetic
    first_name = re.sub(r'[^a-zA-Z]', '', first_name).capitalize()
    
    if len(first_name) < 2:
        return 'unknown'
        
    # Return values map: 'male', 'female', 'mostly_male', 'mostly_female', 'andy', 'unknown'
    return detector.get_gender(first_name)

def map_author_to_voice(author: str) -> str:
    """Assigns a consistent deterministic voice based on hashed author name and gender."""
    hash_int = int(hashlib.md5(author.encode('utf-8')).hexdigest(), 16)
    predicted_gender = get_author_gender(author)
    
    if predicted_gender in ['male', 'mostly_male']:
        return MALE_VOICES[hash_int % len(MALE_VOICES)]
    elif predicted_gender in ['female', 'mostly_female']:
        return FEMALE_VOICES[hash_int % len(FEMALE_VOICES)]
    else:
        # For 'andy' (androgynous) or 'unknown', fallback to full random assignment
        return ALL_VOICES[hash_int % len(ALL_VOICES)]

def generate_mock_wav() -> bytes:
    """Mock WAV builder representing PyTorch Audio output for integration."""
    buf = io.BytesIO()
    with wave.open(buf, 'wb') as wav_file:
        wav_file.setnchannels(1)
        wav_file.setsampwidth(2)
        wav_file.setframerate(24000)
        # 0.5s of empty audio data
        wav_file.writeframes(struct.pack('<h', 0) * 12000)
    return buf.getvalue()

@app.post("/synthesize")
async def synthesize(req: TTSRequest):
    voice_id = map_author_to_voice(req.author)
    
    if pipeline is not None:
        try:
            # Generate audio using Kokoro
            # The generator yields (graphemes, phonemes, audio)
            
            print(f"[DramaReader] Synthesizing -> [{req.author}]: {req.text[:50]}...")
            
            generator = pipeline(
                req.text, voice=voice_id,
                speed=req.speed, split_pattern=r'\n+'
            )
            
            # Combine all generated audio fragments
            audio_arrays = []
            for graphemes, phonemes, audio in generator:
                if audio is not None:
                    audio_arrays.append(audio)
            
            if audio_arrays:
                final_audio = np.concatenate(audio_arrays)
                
                # Write to WAV bytes representation
                buf = io.BytesIO()
                sf.write(buf, final_audio, 24000, format='WAV')
                audio_bytes = buf.getvalue()
                
                return Response(content=audio_bytes, media_type="audio/wav")
        except Exception as e:
            print(f"Kokoro Generation Error: {e}")
            # Fallback to mock on error
            pass

    # Fallback mock audio (e.g. if kokoro is not installed or errors out)
    audio_bytes = generate_mock_wav()
    return Response(content=audio_bytes, media_type="audio/wav")

# Run via: uvicorn main:app --host 127.0.0.1 --port 8000
