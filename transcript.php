<?php
$bot_token = trim(file_get_contents("bot_token.txt"));
$api_url = "https://api.telegram.org/bot$bot_token";

$file = $_GET['file'] ?? null;
if (!$file || !file_exists($file)) {
    die("File not found");
}

$totalSize = filesize($file);
$uploadedSize = 0;
$speed = 2 * 1024 * 1024; // 2MB/s
$encodedFile = urlencode($file);
?>
<!DOCTYPE html>
<html>
<head>
    <title>Transcoding: <?= basename($file) ?></title>
    <meta name='viewport' content='width=device-width, initial-scale=1'>
    <style>
        body { background:#000; color:#fff; font-family:Arial; text-align:center; padding:30px; }
        .bar { width:90%; background:#222; border:1px solid red; margin:10px auto; height:20px; }
        .fill { background:red; height:100%; width:0%; transition:0.2s; }
        .row { display:flex; justify-content:space-between; width:90%; margin:auto; font-size:14px; }
    </style>
</head>
<body>
    <h2>Transcoding & Uploading...</h2>
    <div class='bar'><div class='fill' id='fill'></div></div>
    <div class='row'><div id='left'>0 MB / <?= round($totalSize / 1024 / 1024, 2) ?> MB</div><div id='right'>0 MB/s</div></div>

    <script>
        let uploaded = 0;
        let total = <?= $totalSize ?>;
        let speed = <?= $speed ?>;
        let file = "<?= $encodedFile ?>";

        function formatMB(bytes) {
            return (bytes / (1024 * 1024)).toFixed(2);
        }

        function step() {
            if (uploaded < total) {
                let delta = Math.min(speed, total - uploaded);
                uploaded += delta;
                let percent = (uploaded / total) * 100;
                document.getElementById('fill').style.width = percent + '%';
                document.getElementById('left').innerText = formatMB(uploaded) + ' MB / ' + formatMB(total) + ' MB';
                document.getElementById('right').innerText = formatMB(delta) + ' MB/s';
                setTimeout(step, 1000);
            } else {
                document.getElementById('right').innerText = 'Upload complete!';
                fetch('upload_transcoded.php?file=' + file)
                    .then(res => res.text())
                    .then(d => console.log(d));
            }
        }

        step();
    </script>
</body>
</html>