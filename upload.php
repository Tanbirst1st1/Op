<?php
$bot_token = trim(file_get_contents("bot_token.txt"));
$api_url = "https://api.telegram.org/bot$bot_token";

if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_FILES['video'])) {
    $videoFile = $_FILES['video'];
    if ($videoFile['error'] === UPLOAD_ERR_OK) {
        $filePath = $videoFile['tmp_name'];
        $fileName = $videoFile['name'];
        $caption = $_POST['caption'] ?? 'Video';

        $post_fields = [
            'chat_id' => '@me',
            'video' => new CURLFile($filePath, mime_content_type($filePath), $fileName),
            'caption' => $caption
        ];

        $ch = curl_init();
        curl_setopt($ch, CURLOPT_HTTPHEADER, ["Content-Type:multipart/form-data"]);
        curl_setopt($ch, CURLOPT_URL, "$api_url/sendVideo");
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, 1);
        curl_setopt($ch, CURLOPT_POSTFIELDS, $post_fields);
        $output = curl_exec($ch);
        curl_close($ch);

        echo "OK";
    } else {
        http_response_code(400);
        echo "Upload error.";
    }
} else {
    http_response_code(400);
    echo "Invalid request.";
}