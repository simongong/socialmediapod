// This script runs in the MAIN world (page context) via manifest.json "world": "MAIN".
// It intercepts fetch() calls to detect feed-related API requests on Twitter/X and Reddit,
// then dispatches a CustomEvent so the content script can refresh the playlist.

(function () {
    const originalFetch = window.fetch;

    window.fetch = function (...args) {
        const url = (typeof args[0] === 'string') ? args[0] : (args[0]?.url || '');

        // Twitter/X feed endpoints
        const isTwitterFeed = url.includes('/HomeTimeline') || url.includes('/HomeLatestTimeline');
        // Reddit feed endpoints (new Reddit gateway API)
        const isRedditFeed = url.includes('gateway.reddit.com') && (url.includes('/feed') || url.includes('/listing'));

        if (isTwitterFeed || isRedditFeed) {
            console.log('[Drama Reader] Feed API call detected:', url.substring(0, 80));
            const result = originalFetch.apply(this, args);
            result.then(() => {
                window.dispatchEvent(new CustomEvent('drama-reader-feed-refresh'));
            }).catch(() => { });
            return result;
        }

        return originalFetch.apply(this, args);
    };
})();
