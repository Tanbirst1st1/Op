<?php
// Data storage
$data_file = "data/videos.json";

// Helper: Load data from JSON file
function loadData() {
    global $data_file;
    if (!file_exists($data_file)) {
        return ['videos' => [], 'folders' => [], 'folder_meta' => []];
    }
    $content = @file_get_contents($data_file);
    return $content ? json_decode($content, true) : ['videos' => [], 'folders' => [], 'folder_meta' => []];
}

// Get file_id from query parameter
$fid = $_GET['fid'] ?? '';
if (!$fid) {
    die("No video specified.");
}

// Load data
$data = loadData();
$videos = $data['videos'] ?? [];

// Find video
$video = null;
foreach ($videos as $v) {
    if ($v['file_id'] === $fid) {
        $video = $v;
        break;
    }
}
if (!$video) {
    die("Video not found.");
}

$caption = $video['caption'] ?? 'Untitled Video';
$video_url = $video['file_path'] ?? '';
if (!$video_url) {
    die("Video file path not available.");
}

// Generate embed code
$embed_url = "watch.php?fid=" . urlencode($fid);
$embed_code = '<iframe width="560" height="315" src="' . htmlspecialchars($embed_url) . '" frameborder="0" allowfullscreen></iframe>';
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title><?= htmlspecialchars($caption) ?> - Watch</title>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <link rel="stylesheet" href="https://cdn.plyr.io/3.7.8/plyr.css" />
    <link rel="stylesheet" href="css/styles.css">
    <style>
        body {
            background: #111;
            color: #fff;
            font-family: Arial, sans-serif;
            margin: 0;
            padding: 0;
        }
        .player-container {
            max-width: 900px;
            margin: 0 auto;
            padding: 20px;
        }
        .info-box {
            margin-top: 20px;
            background: #222;
            padding: 15px;
            border-radius: 6px;
            font-size: 0.95rem;
        }
        .info-box strong {
            color: #0af;
        }
        .info-item {
            margin-bottom: 10px;
        }
        header {
            margin-bottom: 20px;
        }
        header a {
            color: #0af;
            text-decoration: none;
        }
        header a:hover {
            text-decoration: underline;
        }
        .embed-code {
            background: #333;
            padding: 10px;
            border-radius: 4px;
            font-family: monospace;
            word-break: break-all;
        }
        .copy-button {
            background: #0af;
            color: #fff;
            border: none;
            padding: 6px 12px;
            border-radius: 4px;
            cursor: pointer;
            margin-top: 10px;
        }
        .copy-button:hover {
            background: #08c;
        }
        .copy-feedback {
            color: #0f0;
            margin-left: 10px;
            display: none;
        }
        @media (max-width: 600px) {
            .player-container {
                padding: 10px;
            }
        }
    </style>
</head>
<body>
    <header>
        <a href="index.php"><i class="fa fa-arrow-left"></i> Back to File Manager</a>
    </header>

    <div class="player-container">
        <video id="player" controls playsinline>
            <source src="<?= htmlspecialchars($video_url) ?>" type="video/mp4">
            Your browser doesn't support HTML5 video.
        </video>

        <div class="info-box">
            <div class="info-item"><strong>Filename:</strong> <?= htmlspecialchars($caption) ?></div>
            <div class="info-item"><strong>File ID:</strong> <?= htmlspecialchars($fid) ?></div>
            <div class="info-item"><strong>Direct Link:</strong> <a href="<?= htmlspecialchars($video_url) ?>" target="_blank" style="color:#0af;"><?= htmlspecialchars($video_url) ?></a></div>
            <div class="info-item">
                <strong>Embed Code:</strong>
                <div class="embed-code"><?= htmlspecialchars($embed_code) ?></div>
                <button class="copy-button" onclick="copyEmbedCode()">Copy</button>
                <span class="copy-feedback" id="copyFeedback">Copied!</span>
            </div>
        </div>
    </div>

    <script src="https://cdn.plyr.io/3.7.8/plyr.js"></script>
    <script>
        // Initialize Plyr player
        const player = new Plyr('#player', {
            captions: { active: true, update: true, language: 'en' },
            quality: {
                default: 720,
                options: [1080, 720, 480, 360],
            }
        });

        // Copy embed code to clipboard
        function copyEmbedCode() {
            const embedCode = <?= json_encode($embed_code) ?>;
            navigator.clipboard.writeText(embedCode).then(() => {
                const feedback = document.getElementById('copyFeedback');
                feedback.style.display = 'inline';
                setTimeout(() => {
                    feedback.style.display = 'none';
                }, 2000);
            }).catch(err => {
                console.error('Failed to copy: ', err);
            });
        }
    </script>
</body>
</html>