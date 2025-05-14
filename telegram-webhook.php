<?php
$botToken = trim(file_get_contents("bot_token.txt"));
$data = json_decode(file_get_contents("php://input"), true);
file_put_contents("log.json", json_encode($data, JSON_PRETTY_PRINT));

if (!file_exists('videos.json')) file_put_contents('videos.json', '[]');
$videos = json_decode(file_get_contents('videos.json'), true);

if (isset($data["channel_post"]["video"])) {
    $video = $data["channel_post"]["video"];
    $caption = $data["channel_post"]["caption"] ?? "No Title";
    $file_id = $video["file_id"];
    $msg_id = $data["channel_post"]["message_id"];
    $channel = $data["channel_post"]["chat"]["id"];

    $exists = false;
    foreach ($videos as $v) {
        if ($v['file_id'] === $file_id) {
            $exists = true;
            break;
        }
    }

    if (!$exists) {
        $videos[] = [
            "file_id" => $file_id,
            "caption" => $caption,
            "channel" => $channel,
            "message_id" => $msg_id
        ];
        file_put_contents('videos.json', json_encode($videos, JSON_PRETTY_PRINT));
    }
}