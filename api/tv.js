// api/tv.js

// ------- Simple In-memory Cache -------
const cacheStore = new Map(); // key: target URL, value: { data, expiry }

// ------- Helpers -------
function slugifyTitle(s) {
  return String(s || "")
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function normalizeImageURL(u) {
  if (!u || u.startsWith("data:")) return "";
  let out = u.replace(/(\.[a-z0-9]{2,6})(\?.*)$/i, "$1");
  try {
    const urlObj = new URL(out);
    if (urlObj.hostname.includes("image.tmdb.org")) return urlObj.toString();
  } catch {}
  return out.replace(/-\d+x\d+(?=(?:\.[a-z0-9]+){1,2}$)/i, "");
}

async function fetchHTML(target, timeoutMs = 20000) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const resp = await fetch(target, {
      method: "GET",
      headers: {
        "user-agent":
          "Mozilla/5.0 (compatible; Scraper/2.0; +https://vercel.com/)",
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      signal: ac.signal,
    });
    if (!resp.ok) {
      throw new Error(`Fetch failed ${resp.status} ${resp.statusText} for ${target}`);
    }
    return await resp.text();
  } finally {
    clearTimeout(t);
  }
}

async function fetchSourcesFromVideo(url) {
  try {
    const apiUrl = `https://multi-movies-api.vercel.app/api/video.js?url=${encodeURIComponent(
      url
    )}`;
    const resp = await fetch(apiUrl, {
      headers: { "user-agent": "Mozilla/5.0 (VideoFetcher/1.0)" },
    });
    if (!resp.ok) return [];
    const json = await resp.json();
    if (!json || !Array.isArray(json.sources)) return [];
    return json.sources.map((s) => ({
      server: s.server || "Unknown",
      url: s.file || s.url || "",
    }));
  } catch {
    return [];
  }
}

// ---- Parse Show Page (basic regex DOM) ----
function parsePage(html, pageUrl, siteRoot) {
  function extract(regex, str) {
    const m = regex.exec(str);
    return m ? m[1].trim() : "";
  }

  const title =
    extract(/<h1[^>]*>([^<]+)<\/h1>/i, html) ||
    extract(/<meta itemprop="name" content="([^"]+)"/i, html);

  let poster = extract(/<img[^>]+src="([^"]+)"[^>]*class="[^"]*poster/i, html);
  poster = normalizeImageURL(new URL(poster, siteRoot).toString());

  const synopsis = extract(
    /<div id="info"[\s\S]*?<div class="wp-content">([\s\S]*?)<\/div>/i,
    html
  ).replace(/<[^>]+>/g, " ");

  const seasons = [];
  const seasonBlocks = html.split('<div class="se-c"').slice(1);
  for (const sb of seasonBlocks) {
    const seasonNumber = parseInt(
      extract(/<span class="se-t">(\d+)<\/span>/, sb),
      10
    );
    const seasonTitle = extract(/<span class="title">([^<]+)<\/span>/, sb);

    const episodes = [];
    const episodeBlocks = sb.split("<li").slice(1);
    for (const eb of episodeBlocks) {
      const numerando = extract(/<span class="numerando">([^<]+)<\/span>/, eb);
      const eMatch = numerando.match(/(\d+)\s*-\s*(\d+)/);
      const seasonNo = eMatch ? parseInt(eMatch[1], 10) : null;
      const episodeNo = eMatch ? parseInt(eMatch[2], 10) : null;

      const epTitle = extract(/class="episodiotitle">[^<]*<a[^>]*>([^<]+)<\/a>/, eb);
      const epUrl = extract(/class="episodiotitle">[^<]*<a href="([^"]+)"/, eb);
      const airDate = extract(/<span class="date">([^<]+)<\/span>/, eb);
      const thumbRaw = extract(/<img[^>]+src="([^"]+)"/, eb);
      const thumb = normalizeImageURL(new URL(thumbRaw, siteRoot).toString());

      episodes.push({
        seasonNo,
        episodeNo,
        title: epTitle,
        url: epUrl,
        airDate,
        thumbnail: thumb,
        sources: [],
      });
    }
    if (seasonNumber || episodes.length) {
      seasons.push({ seasonNumber, seasonTitle, episodes });
    }
  }

  return {
    ok: true,
    scrapedFrom: pageUrl,
    meta: { title, poster, synopsis },
    seasons,
  };
}

// ---- Preloader: fetch episode sources ----
async function preloadEpisodeSources(seasons, delay = 1500) {
  for (const season of seasons) {
    for (const ep of season.episodes) {
      ep.sources = await fetchSourcesFromVideo(ep.url);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  return seasons;
}

// ------- Handler -------
export default async function handler(req, res) {
  try {
    const { query } = req;
    const base = "https://multimovies.lol/";
    let target = query.url || "";

    if (!target) {
      const slugParam = query.slug ? String(query.slug) : "";
      if (!slugParam) {
        res.status(400).json({ ok: false, error: "Missing slug or url" });
        return;
      }
      const section = query.section || "tvshows";
      target = `${base}${section}/${slugifyTitle(slugParam)}/`;
    }

    const now = Date.now();
    const cached = cacheStore.get(target);
    if (cached && cached.expiry > now) {
      res.setHeader(
        "cache-control",
        "s-maxage=500, stale-while-revalidate=600"
      );
      res.status(200).json({ ...cached.data, cache: true });
      return;
    }

    const html = await fetchHTML(target);
    let data = parsePage(html, target, base);

    data.seasons = await preloadEpisodeSources(data.seasons);

    cacheStore.set(target, { data, expiry: now + 500 * 1000 });

    res.setHeader("cache-control", "s-maxage=500, stale-while-revalidate=600");
    res.status(200).json({ ...data, cache: false });
  } catch (err) {
    res.status(500).json({
      ok: false,
      error: err.message || String(err),
    });
  }
}
