# Centralized constants for the Drama Reader backend

# Local MPS-compatible Kokoro preset voices separated by gender
# We omitted af_aoede, af_sky (older/slower female voices) and am_puck, am_santa (older male voices)
FEMALE_VOICES = [
    "af_heart", "af_bella", "af_alloy", "af_jessica", 
    "af_kore", "af_nova", "af_river"
]

MALE_VOICES = [
    "am_michael", "am_adam", "am_echo", "am_eric", "am_fenrir", 
    "am_liam"
]

ALL_VOICES = FEMALE_VOICES + MALE_VOICES
