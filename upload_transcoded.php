<?php
$bot_token = trim(file_get_contents("bot_token.txt"));
$api_url = "https://api.telegram.org/bot$bot_token/sendVideo";

$file = $_GET['file'] ?? null;
if (!$file || !file_exists($file)) {
    die("File not found");
}

$realPath = realpath($file);
if (!$realPath || !file_exists($realPath)) {
    die("Real path not found");
}

$post_fields = array(
    'chat_id' => 123456789, // Replace with your actual Telegram user ID (not @username or channel)
    'video' => new CURLFile($realPath),
    'caption' => basename($file)
);

$ch = curl_init();
curl_setopt($ch, CURLOPT_HTTPHEADER, array(
    "Content-Type:multipart/form-data"
));
curl_setopt($ch, CURLOPT_URL, $api_url);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, 1);
curl_setopt($ch, CURLOPT_POSTFIELDS, $post_fields);
$output = curl_exec($ch);
curl_close($ch);
echo "Uploaded";
?>