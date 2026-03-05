let isPlaying = false;
let currentPlaylist = []; // Array of { author, fullText, sentences: string[], element }
let currentPlaylistIndex = 0;
let currentSentenceIndex = 0;
let currentAudioElement = null;
let playSessionId = 0; // Ensures strict singleton playback
let processedTexts = new Set(); // Tracks unique author+text combinations
let isUIVisible = true;
let currentSpeed = 1.0;
let nextAudioBlob = null; // Pre-buffering queue for smooth transitions
let isFetchingNext = false;
const SPEED_OPTIONS = [0.8, 0.9, 1.0, 1.2, 1.4, 1.6];

// Helper to determine if text is mostly non-English (e.g. pure Chinese/Japanese)
// Kokoro's English models fail hard on these, so we omit them from the playlist.
function isOmittedText(text) {
  if (text.length < 5) return false;
  const englishCharRatio = (text.match(/[a-zA-Z]/g) || []).length / text.length;
  return englishCharRatio < 0.7;
}

// Detect SPA Navigation (URL Changes) to reset playlists automatically
let currentUrl = location.href;
new MutationObserver(() => {
  const url = location.href;
  if (url !== currentUrl) {
    console.log("[Drama Reader] Navigation detected. Resetting playlist.");
    currentUrl = url;
    stopDrama();
    processedTexts.clear();
  }
}).observe(document, { subtree: true, childList: true });

function injectUI() {
  console.log("[Drama Reader] Injecting Modern UI into", window.location.href);

  const container = document.createElement('div');
  container.id = 'drama-reader-ui';
  container.style.cssText = `
    position: fixed;
    bottom: 24px;
    right: 24px;
    z-index: 2147483647;
    background: rgba(17, 24, 39, 0.95);
    backdrop-filter: blur(10px);
    padding: 16px;
    border-radius: 16px;
    box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.5);
    display: flex;
    flex-direction: column;
    gap: 12px;
    font-family: system-ui, -apple-system, sans-serif;
    color: white;
    width: 320px;
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  `;

  // --- Header / Track Info ---
  const header = document.createElement('div');
  header.style.cssText = `display: flex; justify-content: space-between; align-items: center;`;

  const trackInfo = document.createElement('div');
  trackInfo.id = 'drama-track-info';
  trackInfo.style.cssText = `font-size: 13px; font-weight: 500; color: #9ca3af; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 280px;`;
  trackInfo.textContent = 'Drama Reader Ready';

  header.appendChild(trackInfo);

  // --- Controls ---
  const controls = document.createElement('div');
  controls.style.cssText = `display: flex; justify-content: center; align-items: center; gap: 16px;`;

  const speedContainer = document.createElement('div');
  speedContainer.style.cssText = `position: relative; display: flex; align-items: center; justify-content: center;`;

  const speedBtn = document.createElement('button');
  speedBtn.id = 'drama-speed-btn';
  speedBtn.textContent = '1.0x';
  speedBtn.onclick = toggleSpeedMenu;
  speedBtn.style.cssText = `
    background: transparent;
    color: #e5e7eb;
    border: none;
    cursor: pointer;
    font-size: 13px;
    font-weight: 600;
    width: 44px;
    height: 40px;
    border-radius: 8px;
    transition: all 0.2s ease;
  `;
  speedBtn.onmouseover = () => { speedBtn.style.background = 'rgba(255,255,255,0.1)'; };
  speedBtn.onmouseout = () => { speedBtn.style.background = 'transparent'; };

  const speedMenu = document.createElement('div');
  speedMenu.id = 'drama-speed-menu';
  speedMenu.style.cssText = `
    display: none;
    position: absolute;
    bottom: 45px;
    left: 50%;
    transform: translateX(-50%);
    background: rgba(17, 24, 39, 0.95);
    border: 1px solid #374151;
    border-radius: 8px;
    padding: 6px 0;
    flex-direction: column;
    box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.5);
    z-index: 2147483648;
    min-width: 60px;
  `;

  SPEED_OPTIONS.forEach(speed => {
    const opt = document.createElement('div');
    opt.textContent = speed.toFixed(1) + 'x';
    opt.style.cssText = `
      padding: 8px 16px;
      font-size: 14px;
      font-weight: 500;
      color: #e5e7eb;
      cursor: pointer;
      text-align: center;
      white-space: nowrap;
      transition: background 0.2s;
    `;
    opt.onmouseover = () => opt.style.background = '#374151';
    opt.onmouseout = () => opt.style.background = 'transparent';
    opt.onclick = () => setSpeed(speed);
    speedMenu.appendChild(opt);
  });

  speedContainer.appendChild(speedBtn);
  speedContainer.appendChild(speedMenu);

  const prevBtn = createIconBtn('<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M6 6h2v12H6zm3.5 6l8.5 6V6z"/></svg>', () => skipTo(currentPlaylistIndex - 1));
  const playPauseBtn = createIconBtn('<svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor" id="drama-play-icon"><path d="M8 5v14l11-7z"/></svg>', togglePlayPause);
  const nextBtn = createIconBtn('<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/></svg>', () => skipTo(currentPlaylistIndex + 1));
  const listBtn = createIconBtn('<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M3 13h2v-2H3v2zm0 4h2v-2H3v2zm0-8h2V7H3v2zm4 4h14v-2H7v2zm0 4h14v-2H7v2zM7 7v2h14V7H7z"/></svg>', togglePlaylist);

  controls.appendChild(speedContainer);
  controls.appendChild(prevBtn);
  controls.appendChild(playPauseBtn);
  controls.appendChild(nextBtn);
  controls.appendChild(listBtn);

  // --- Playlist Container ---
  const playlistContainer = document.createElement('div');
  playlistContainer.id = 'drama-playlist-view';
  playlistContainer.style.cssText = `
    display: none;
    flex-direction: column;
    gap: 8px;
    max-height: 200px;
    overflow-y: auto;
    margin-top: 8px;
    padding-top: 12px;
    border-top: 1px solid #374151;
    font-size: 12px;
  `;

  container.appendChild(header);
  container.appendChild(controls);
  container.appendChild(playlistContainer);
  document.body.appendChild(container);

  // Inject highlighting styles
  if (!document.getElementById('drama-styles')) {
    const style = document.createElement('style');
    style.id = 'drama-styles';
    style.textContent = `
      .drama-highlight {
        background-color: rgba(250, 204, 21, 0.25) !important;
        outline: 3px solid #eab308 !important;
        border-radius: 6px;
        transition: all 0.3s ease;
      }
      #drama-playlist-view::-webkit-scrollbar { width: 6px; }
      #drama-playlist-view::-webkit-scrollbar-thumb { background: #4b5563; border-radius: 3px; }
      .drama-playlist-item {
        padding: 6px 8px;
        border-radius: 4px;
        cursor: pointer;
        display: flex;
        gap: 8px;
        color: #d1d5db;
        transition: background 0.2s;
      }
      .drama-playlist-item:hover { background: #374151; }
      .drama-playlist-item.active { background: #2563eb; color: white; }
    `;
    document.head.appendChild(style);
  }
}

function clearHighlights() {
  document.querySelectorAll('.drama-highlight').forEach(el => {
    el.classList.remove('drama-highlight');
  });
}

function createIconBtn(svgHTML, onClick) {
  const btn = document.createElement('button');
  btn.innerHTML = svgHTML;
  btn.onclick = onClick;
  btn.style.cssText = `
    background: transparent;
    color: #e5e7eb;
    border: none;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    width: 40px;
    height: 40px;
    transition: all 0.2s ease;
  `;
  btn.onmouseover = () => { btn.style.background = 'rgba(255,255,255,0.1)'; btn.style.transform = 'scale(1.05)'; };
  btn.onmouseout = () => { btn.style.background = 'transparent'; btn.style.transform = 'scale(1)'; };
  return btn;
}

function updateTrackInfo(index) {
  const trackInfo = document.getElementById('drama-track-info');
  const playlistView = document.getElementById('drama-playlist-view');

  if (currentPlaylist[index]) {
    const item = currentPlaylist[index];
    currentPlaylistIndex = index;
    // Show a snippet of the text
    const snippet = item.fullText.length > 30 ? item.fullText.substring(0, 30) + '...' : item.fullText;
    trackInfo.textContent = `${item.author}: ${snippet}`;
  }

  // Update active state in playlist
  if (playlistView.style.display !== 'none') {
    renderPlaylist();
  }
}

function updatePlayPauseIcon() {
  const icon = document.getElementById('drama-play-icon');
  if (!icon) return;
  if (isPlaying) {
    // Pause Icon
    icon.innerHTML = '<path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>';
  } else {
    // Play Icon
    icon.innerHTML = '<path d="M8 5v14l11-7z"/>';
  }
}

function togglePlayPause() {
  if (currentPlaylist.length === 0) {
    startDrama();
  } else if (isPlaying) {
    pauseDrama();
  } else {
    resumeDrama();
  }
}

function toggleSpeedMenu() {
  const menu = document.getElementById('drama-speed-menu');
  if (menu.style.display === 'none' || menu.style.display === '') {
    menu.style.display = 'flex';
  } else {
    menu.style.display = 'none';
  }
}

function setSpeed(speed) {
  currentSpeed = speed;
  document.getElementById('drama-speed-btn').textContent = currentSpeed.toFixed(1) + 'x';
  document.getElementById('drama-speed-menu').style.display = 'none';

  // Apply HTML5 playbackRate instantly to the playing audio without restarting TTS backend
  if (currentAudioElement) {
    currentAudioElement.playbackRate = currentSpeed;
  }
}

function skipTo(index) {
  if (index < 0 || index >= currentPlaylist.length) return;

  if (currentAudioElement) {
    currentAudioElement.pause();
    currentAudioElement.removeAttribute('src');
    currentAudioElement.load();
    currentAudioElement = null;
  }

  nextAudioBlob = null; // Invalidate pre-buffer when manually skipping
  isFetchingNext = false;
  currentSentenceIndex = 0; // Reset sentence inside the new post
  playSessionId++; // Invalidate current
  isPlaying = true;
  updatePlayPauseIcon();
  playSequence(index, playSessionId);
}

function togglePlaylist() {
  const view = document.getElementById('drama-playlist-view');
  if (view.style.display === 'none' || view.style.display === '') {
    view.style.display = 'flex';
    renderPlaylist();
  } else {
    view.style.display = 'none';
  }
}

function renderPlaylist() {
  const view = document.getElementById('drama-playlist-view');
  view.innerHTML = '';

  currentPlaylist.forEach((item, idx) => {
    if (!item || !item.fullText) return; // Safeguard corrupted items
    const row = document.createElement('div');
    row.className = `drama-playlist-item ${idx === currentPlaylistIndex ? 'active' : ''}`;

    const snippet = item.fullText.length > 40 ? item.fullText.substring(0, 40) + '...' : item.fullText;

    row.innerHTML = `
      <span style="font-weight:bold; color: ${idx === currentPlaylistIndex ? '#fff' : '#9ca3af'}; min-width: 60px; overflow: hidden; text-overflow: ellipsis;">${item.author}</span>
      <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${snippet}</span>
    `;

    row.onclick = () => skipTo(idx);
    view.appendChild(row);

    if (idx === currentPlaylistIndex) {
      row.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  });
}

function startDrama() {
  const domain = window.location.hostname;
  let data = [];

  if (domain.includes('twitter.com') || domain.includes('x.com')) {
    data = extractTwitter();
  } else if (domain.includes('reddit.com')) {
    data = extractReddit();
  }

  if (data.length === 0) return alert('No extractable thread found.');

  // Stop any currently playing audio so they don't overlap, but DON'T CLEAR processTexts
  stopDrama();

  currentPlaylist = data;
  currentPlaylistIndex = 0;
  currentSentenceIndex = 0;
  isPlaying = true; // Set to true after stopDrama() zeroes it
  nextAudioBlob = null; // Clear queue
  isFetchingNext = false;
  updatePlayPauseIcon();
  playSessionId++; // Start a new playback session
  playSequence(0, playSessionId);
}

function pauseDrama() {
  isPlaying = false;
  updatePlayPauseIcon();
  if (currentAudioElement) currentAudioElement.pause();
}

function resumeDrama() {
  if (currentAudioElement && currentPlaylist.length > 0) {
    isPlaying = true;
    updatePlayPauseIcon();
    currentAudioElement.play();
  } else if (currentPlaylist.length > 0) {
    // If audio element was destroyed but we have a playlist, jumpstart it
    isPlaying = true;
    updatePlayPauseIcon();
    skipTo(currentPlaylistIndex);
  }
}

function stopDrama() {
  isPlaying = false;
  playSessionId++; // Invalidate any running sequences
  currentPlaylist = [];
  currentSentenceIndex = 0;
  nextAudioBlob = null;
  isFetchingNext = false;
  // Notice we DO NOT clear processTexts here, so lazy loading across multiple Plays won't duplicate.
  // Exception: if we want to truly start over, we click stop and then refresh page.
  clearHighlights();
  document.getElementById('drama-track-info').textContent = 'Drama Reader Ready';
  updatePlayPauseIcon();
  if (currentAudioElement) {
    currentAudioElement.pause();
    currentAudioElement.removeAttribute('src'); // Completely detach audio
    currentAudioElement.load();
    currentAudioElement = null;
  }
  const view = document.getElementById('drama-playlist-view');
  if (view) view.style.display = 'none';
}

function extractTwitter() {
  const tweets = document.querySelectorAll('[data-testid="tweet"]');
  const results = [];

  tweets.forEach(tweet => {
    const nameNode = tweet.querySelector('[data-testid="User-Name"]');
    const textNode = tweet.querySelector('[data-testid="tweetText"]');

    if (nameNode && textNode) {
      // Check for Ad banners anywhere in the tweet's header area
      // We use textContent instead of innerText because Adblockers might hide the Ad label (making innerText empty)
      const isAd = Array.from(tweet.querySelectorAll('span, div')).some(el => el.textContent.trim() === 'Ad');
      if (isAd) {
        console.log("Skipping Promoted Tweet (Ad)");
        return;
      }

      // First line of User-Name usually contains the display name
      const author = nameNode.innerText.split('\n')[0].trim() || "Unknown";

      // Clean up Twitter URLs: grab the visible text (usually just the domain, ex: twitter.com)
      // instead of the raw http anchor href which causes the TTS to read 'h t t p colon slash slash'
      // We use string replacement instead of DOM mutation to prevent breaking Twitter's React/accessibility tree
      let text = textNode.innerText.trim();
      text = text.replace(/https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)/g, (match) => {
        try {
          return new URL(match).hostname.replace('www.', '');
        } catch (e) {
          return match;
        }
      });

      // We still use Twitter's DOM node as a single element, no chunking needed usually since it's short,
      // but to unify the data model we'll wrap it in array
      const uniqueKey = `${author}|${text}`;
      if (text && !processedTexts.has(uniqueKey)) {
        processedTexts.add(uniqueKey);
        if (!isOmittedText(text)) {
          results.push({ author, fullText: text, sentences: [text], element: textNode });
        } else {
          console.log("Skipping non-English dominant tweet:", text);
        }
      }
    }
  });

  return results;
}

function extractReddit() {
  const results = [];
  const isHomepage = document.querySelector('shreddit-feed') !== null;

  // Helper to chunk long texts homogeneously across all Reddit elements
  const pushTextChunks = (author, fullText, targetElement) => {
    // OVERRIDE FOR FEEDS: Truncate long feed posts to match visual length
    if (isHomepage && fullText.length > 800 && targetElement.tagName === 'SHREDDIT-POST') {
      fullText = fullText.substring(0, 800) + "... (Click into post to hear more.)";
    }

    const chunks = fullText.split(/(?<=[.!?])\s+|[\n]+/);
    let currentChunk = "";
    const sentences = [];

    chunks.forEach((chunk, i) => {
      if (!chunk.trim()) return;
      currentChunk += chunk + " ";

      // Group sentences into chunks of rough 200 character blocks to reduce fetch overhead but keep TTS fast
      if (currentChunk.length > 200 || i === chunks.length - 1) {
        const finalStr = currentChunk.trim();
        if (!isOmittedText(finalStr)) {
          sentences.push(finalStr);
        }
        currentChunk = "";
      }
    });

    if (sentences.length > 0) {
      // Use the first sentence to denote uniqueness
      const uniqueKey = `${author}|chunk_${sentences[0].substring(0, 20)}`;
      if (!processedTexts.has(uniqueKey)) {
        processedTexts.add(uniqueKey);
        results.push({ author, fullText: sentences.join(" "), sentences: sentences, element: targetElement });
      }
    }
  };

  // 1. Extract Posts (handles both Single Thread and Homepage feeds)
  const posts = document.querySelectorAll('shreddit-post');
  posts.forEach(post => {
    // Skip promoted/ad posts aggressively
    if (post.hasAttribute('promoted') || Array.from(post.querySelectorAll('span, div, a')).some(el => el.textContent.trim().toLowerCase() === 'promoted')) {
      return;
    }

    const author = post.getAttribute('author') || "OriginalPoster";
    const title = post.getAttribute('post-title') || "";
    let joinedText = title;

    const textBody = post.querySelector('shreddit-post-text-body');
    let targetElement = post;

    if (textBody) {
      const pTags = textBody.querySelectorAll('p');
      if (pTags.length > 0) {
        let bodyContent = Array.from(pTags)
          .filter(p => !p.closest('shreddit-comment'))
          .map(p => p.innerText.trim())
          .join('. ');
        if (bodyContent) joinedText += ". " + bodyContent;
      } else {
        joinedText += ". " + textBody.innerText.trim();
      }
    } else {
      let pTags = Array.from(post.querySelectorAll('p')).filter(p => !p.closest('shreddit-comment'));
      if (pTags.length > 0) {
        joinedText += ". " + pTags.map(p => p.innerText.trim()).join('. ');
      }
    }

    if (!joinedText.trim()) return;
    pushTextChunks(author, joinedText, targetElement);
  });

  // 2. Extract Comments (New Reddit UI / shreddit)
  const shredditComments = document.querySelectorAll('shreddit-comment');
  if (shredditComments.length > 0) {
    shredditComments.forEach(comment => {
      // Skip folded or collapsed comments completely
      if (comment.hasAttribute('collapsed') && comment.getAttribute('collapsed') !== "false") {
        return;
      }

      const author = comment.getAttribute('author') || "Unknown";
      let text = "";
      let targetElement = comment;

      const contentLayer = comment.querySelector('[id^="-post-rtjson-content"]');
      if (contentLayer) {
        text = contentLayer.innerText.trim();
        targetElement = contentLayer;
      } else {
        // Fallback: collect all p tags inside the comment
        let pTags = Array.from(comment.querySelectorAll('p'));
        // Make sure we only grab p tags that belong to THIS comment, not nested replies
        pTags = pTags.filter(p => p.closest('shreddit-comment') === comment);

        if (pTags.length > 0) {
          text = pTags.map(p => p.innerText.trim()).join('. ');
          targetElement = pTags[0].parentElement;
        }
      }

      if (text) pushTextChunks(author, text, targetElement);
    });
  }

  // 3. Fallback for old.reddit.com / classic UI
  if (results.length === 0) {
    const comments = document.querySelectorAll('.comment');
    comments.forEach(comment => {
      const authorNode = comment.querySelector('.author');
      const textNode = comment.querySelector('.md');

      // Skip old.reddit collapsed
      if (comment.classList.contains('collapsed')) return;

      if (authorNode && textNode) {
        const author = authorNode.innerText.trim();
        const text = textNode.innerText.trim();
        if (text) pushTextChunks(author, text, textNode);
      }
    });
  }

  return results;
}

async function playSequence(index, sessionId) {
  // Strict Singleton check: If the session ID changed (user hit stop/play), abort out of this recursion.
  if (sessionId !== playSessionId || !isPlaying) return;

  if (index >= currentPlaylist.length) {
    // Attempt dynamic lazy-load polling
    const domain = window.location.hostname;
    let newData = [];
    if (domain.includes('twitter.com') || domain.includes('x.com')) {
      newData = extractTwitter();
    } else if (domain.includes('reddit.com')) {
      newData = extractReddit();
    }

    if (newData.length > 0) {
      // Lazy Load succeded, we found new unread text!
      currentPlaylist = currentPlaylist.concat(newData);

      // Update UI Playlist tracking
      if (document.getElementById('drama-playlist-view').style.display !== 'none') {
        renderPlaylist();
      }
    } else {
      // Clean up and stop if truly nothing new is found
      stopDrama();
      return;
    }
  }

  const item = currentPlaylist[index];
  if (!item || !item.sentences || item.sentences.length === 0) {
    console.error("Encountered corrupt playlist item:", item);
    stopDrama();
    return;
  }
  const sentenceText = item.sentences[currentSentenceIndex];

  // Only update UI scrolling and coloring if we are traversing the first sentence of a block
  if (currentSentenceIndex === 0) {
    updateTrackInfo(index);
    clearHighlights();

    // Verify Virtual DOM node validity
    const isValidElement = (el, textMatch) => {
      if (!el || !document.body.contains(el)) return false;
      const snippet = textMatch.substring(0, 15).trim();
      const content = el.textContent || el.innerText || "";
      return content.includes(snippet);
    };

    if (isValidElement(item.element, item.fullText)) {
      item.element.classList.add('drama-highlight');
      item.element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } else {
      window.scrollBy({ top: Math.min(window.innerHeight * 0.8, 800), behavior: 'smooth' });
    }
  }

  try {
    let blob;
    // Check if we hit the pre-fetched cache
    if (nextAudioBlob) {
      blob = nextAudioBlob;
      nextAudioBlob = null; // Consume
    } else {
      const response = await fetch('http://localhost:8000/synthesize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ author: item.author, text: sentenceText })
      });

      if (sessionId !== playSessionId || !isPlaying) return;
      if (!response.ok) throw new Error(`Backend Error: ${response.status}`);
      blob = await response.blob();
    }

    if (sessionId !== playSessionId || !isPlaying) return;

    // Explicitly define the MIME type to satisfy Chrome
    const audioBlob = new Blob([blob], { type: 'audio/wav' });
    const audioUrl = URL.createObjectURL(audioBlob);

    currentAudioElement = new Audio();
    currentAudioElement.src = audioUrl;
    currentAudioElement.type = 'audio/wav';

    // Apply user selected speed natively
    currentAudioElement.playbackRate = currentSpeed;

    const determineNextIndices = () => {
      let nextS = currentSentenceIndex + 1;
      let nextP = index;
      if (currentPlaylist[nextP] && nextS >= currentPlaylist[nextP].sentences.length) {
        nextS = 0;
        nextP++;
      }
      return { nextP, nextS };
    };

    // When audio finishes naturally, move to the next item
    currentAudioElement.onended = () => {
      URL.revokeObjectURL(audioUrl);
      if (sessionId === playSessionId && isPlaying) {
        const { nextP, nextS } = determineNextIndices();
        currentSentenceIndex = nextS;
        playSequence(nextP, sessionId);
      }
    };

    currentAudioElement.onerror = (e) => {
      console.error("Audio playback error", e);
      URL.revokeObjectURL(audioUrl);
      if (sessionId === playSessionId && isPlaying) {
        const { nextP, nextS } = determineNextIndices();
        currentSentenceIndex = nextS;
        playSequence(nextP, sessionId);
      }
    };

    // Browsers often require audio to be explicitly played via promise
    await currentAudioElement.play().catch(e => {
      console.error("Audio play promise rejected:", e);
      URL.revokeObjectURL(audioUrl);
      if (sessionId === playSessionId && isPlaying) {
        const { nextP, nextS } = determineNextIndices();
        currentSentenceIndex = nextS;
        playSequence(nextP, sessionId);
      }
    });

    // 🚀 ASYNC PRE-BUFFERING 🚀
    // While the current audio is streaming out of speakers, we quietly fetch the *next* block in the background
    const { nextP, nextS } = determineNextIndices();
    if (nextP < currentPlaylist.length && sessionId === playSessionId && isPlaying) {
      const nextSentence = currentPlaylist[nextP].sentences[nextS];
      isFetchingNext = true;
      fetch('http://localhost:8000/synthesize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ author: currentPlaylist[nextP].author, text: nextSentence })
      })
        .then(r => r.ok ? r.blob() : null)
        .then(b => {
          if (b && sessionId === playSessionId) nextAudioBlob = b;
        })
        .catch(e => console.error("Preload Next Failed:", e))
        .finally(() => isFetchingNext = false);
    }

  } catch (err) {
    console.error("TTS Failed:", err);
    // Proceed to next element if the backend has a hiccup
    if (sessionId === playSessionId && isPlaying) {
      let nextS = currentSentenceIndex + 1;
      let nextP = index;
      if (nextS >= currentPlaylist[nextP].sentences.length) {
        currentSentenceIndex = 0;
        playSequence(nextP + 1, sessionId);
      } else {
        currentSentenceIndex = nextS;
        playSequence(nextP, sessionId);
      }
    }
  }
}

injectUI();
