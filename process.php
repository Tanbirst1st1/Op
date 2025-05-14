<?php
// process.php
if (!isset($_GET['file_id'])) {
  echo "No file_id provided."; exit;
}
$file_id = $_GET['file_id'];

$dir = __DIR__ . '/processed';
if (!is_dir($dir)) mkdir($dir, 0777, true);

// Use hash of file_id to track
$hash     = md5($file_id);
$doneFile = "$dir/$hash.done";

if (file_exists($doneFile)) {
  echo "Already processed."; exit;
}

// mark as in-progress
file_put_contents($doneFile, "processing");

// launch background task
$cmd = sprintf(
  'php %s/background_task.php %s > /dev/null 2>&1 &',
  __DIR__,
  escapeshellarg($file_id)
);
exec($cmd);

echo "Processing started!";