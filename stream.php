<?php
$bot_token = trim(file_get_contents("bot_token.txt"));

if (!isset($_GET['file_id'])) {
    http_response_code(400);
    exit("Missing file_id");
}

$file_id = $_GET['file_id'];

// Step 1: Get File Path
$get_file_url = "https://api.telegram.org/bot$bot_token/getFile?file_id=$file_id";
$response = file_get_contents($get_file_url);
$data = json_decode($response, true);

if (!isset($data['result']['file_path'])) {
    http_response_code(404);
    exit("File not found on Telegram servers.");
}

$file_path = $data['result']['file_path'];
$file_url = "https://api.telegram.org/file/bot$bot_token/$file_path";

// Step 2: Stream Video
header("Content-Type: video/mp4");
readfile($file_url);