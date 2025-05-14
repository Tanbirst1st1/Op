<?php
// background_task.php
// Usage: php background_task.php <file_id>
if ($argc < 2) exit;
$file_id = $argv[1];
$bot_token = trim(file_get_contents(__DIR__."/bot_token.txt"));
$api_url   = "https://api.telegram.org/bot$bot_token";

// 1. Get file_path from Telegram
$info = json_decode(
  file_get_contents("$api_url/getFile?file_id=".urlencode($file_id)), 
  true
);
if (empty($info['result']['file_path'])) exit;

// 2. Download video locally
$path      = $info['result']['file_path'];
$video_url = "https://api.telegram.org/file/bot$bot_token/$path";
$hash      = md5($file_id);
$tmpDir    = __DIR__."/processed/$hash";
if (!is_dir($tmpDir)) mkdir($tmpDir, 0777, true);
$localFile = "$tmpDir/original." . pathinfo($path, PATHINFO_EXTENSION);
file_put_contents($localFile, file_get_contents($video_url));

// 3. Generate multiple qualities
$qualities = [
  '1080' => '1920:-2',
  '720'  => '1280:-2',
  '480'  => '854:-2',
];
foreach ($qualities as $label => $scale) {
  $out = "$tmpDir/video_{$label}p.mp4";
  $cmd = "ffmpeg -i " . escapeshellarg($localFile)
       . " -vf scale={$scale} -c:v libx264 -preset veryfast -crf 23"
       . " -c:a aac -b:a 128k "
       . escapeshellarg($out)
       . " -y";
  exec($cmd);
}

// 4. Generate transcript via Whisper (requires Whisper installed)
$srtOut = "$tmpDir/subtitles.srt";
exec("whisper ".escapeshellarg($localFile)." --model small --output_format srt --output_dir ".
     escapeshellarg($tmpDir));

// 5. Mark done
file_put_contents(__DIR__."/processed/$hash.done", "done");