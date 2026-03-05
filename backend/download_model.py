import os
import sys
from kokoro import KPipeline
from consts import ALL_VOICES

print("Starting pre-download of Kokoro-82M model and initial voices...")
print("This will download the necessary model weights (~82MB) and American English voice arrays.")

try:
    # Initializing the pipeline with 'a' (American English) automatically triggers
    # the download of the model weights and necessary espeak-ng dictionaries
    # to the huggingface cache directory if they aren't already present.
    pipeline = KPipeline(lang_code='a') 
    
    # We can also explicitly request a specific voice to ensure it's cached
    # The pipeline lazily loads voice tensors upon first use.
    print("Pre-loading primary voices...")
    
    for voice in ALL_VOICES:
        print(f"Caching voice: {voice}")
        try:
            # Generate a 1-character silent/dummy payload to force the voice to load
            _ = list(pipeline("test", voice=voice))
        except Exception as e:
            print(f"Warning: Could not pre-cache voice {voice}: {e}")
            
    print("\n✅ Pre-download complete! The backend is ready for instant inference.")
except Exception as e:
    print(f"\n❌ Pre-download failed: {e}")
    print("Ensure you have installed all requirements via pip.")
