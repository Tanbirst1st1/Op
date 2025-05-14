<?php
// Enable error reporting for debugging (comment out in production)
ini_set('display_errors', 1);
ini_set('display_startup_errors', 1);
error_reporting(E_ALL);

// Bot configuration
$bot_token_file = "data/bot_token.txt";
$bot_token = @file_exists($bot_token_file) ? @trim(@file_get_contents($bot_token_file)) : '';
$api_base = "https://api.telegram.org/bot$bot_token";

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

// Helper: Save data to JSON file
function saveData($data) {
    global $data_file;
    $dir = dirname($data_file);
    if (!is_dir($dir)) {
        mkdir($dir, 0755, true);
    }
    return file_put_contents($data_file, json_encode($data, JSON_PRETTY_PRINT));
}

// Helper: Send request to Telegram API
function telegramRequest($method, $params = []) {
    global $api_base;
    if (!$api_base) return ['ok' => false, 'error' => 'Invalid bot token'];
    $url = "$api_base/$method";
    $ch = curl_init($url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_POSTFIELDS, $params);
    curl_setopt($ch, CURLOPT_TIMEOUT, 10);
    $response = curl_exec($ch);
    curl_close($ch);
    return $response ? json_decode($response, true) : ['ok' => false, 'error' => 'CURL failed'];
}

// Helper: Fetch file path from Telegram
function getFilePath($file_id) {
    global $bot_token;
    $file_info = telegramRequest("getFile", ['file_id' => $file_id]);
    if (!$file_info['ok']) return null;
    $file_path = $file_info['result']['file_path'];
    return "https://api.telegram.org/file/bot$bot_token/$file_path";
}

// Load existing data
$data = loadData();
$videos = $data['videos'] ?? [];
$folders = $data['folders'] ?? [];
$folder_meta = $data['folder_meta'] ?? [];
$meta = [];
$seen = [];
foreach ($videos as $v) {
    $fid = $v['file_id'];
    $seen[] = $fid;
    $meta[$fid] = [
        'caption' => $v['caption'] ?? '',
        'folder' => $v['folder'] ?? ''
    ];
}

// Fetch new videos from bot
$offset = 0;
do {
    $updates = telegramRequest("getUpdates", ['offset' => $offset, 'limit' => 100]);
    if (!$updates['ok'] || empty($updates['result'])) break;
    foreach ($updates['result'] as $update) {
        $offset = $update['update_id'] + 1;
        if (!isset($update['message']) || !isset($update['message']['video'])) continue;
        $post = $update['message'];
        $v = $post['video'];
        $fid = $v['file_id'];
        if (in_array($fid, $seen)) continue;
        $seen[] = $fid;
        $video_data = [
            'file_id' => $fid,
            'caption' => $post['caption'] ?? 'Untitled Video',
            'resolution' => $v['height'] . 'p',
            'size' => isset($v['file_size']) ? number_format($v['file_size'] / 1048576, 1) . ' MB' : '',
            'folder' => '',
            'file_path' => getFilePath($fid)
        ];
        $videos[] = $video_data;
        $meta[$fid] = [
            'caption' => $video_data['caption'],
            'folder' => ''
        ];
    }
} while (!empty($updates['result']));

// Save updated videos to JSON file
$data = [
    'videos' => $videos,
    'folders' => $folders,
    'folder_meta' => $folder_meta
];
saveData($data);

// Handle POST actions
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    header('Content-Type: application/json');
    $response = ['success' => false, 'message' => '', 'data' => []];
    $action = $_POST['action'] ?? '';
    $destFolder = trim($_POST['folder_select'] ?? '');
    $isAjax = isset($_POST['ajax']);
    
    // Create new folder
    if ($action === 'add_folder' && !empty($_POST['folder_name'])) {
        $name = trim($_POST['folder_name']);
        $parent = trim($_POST['parent_folder'] ?? '');
        $full = $parent ? "$parent/$name" : $name;
        if (!in_array($full, $folders)) {
            $folders[] = $full;
            sort($folders);
            $folder_meta[$full] = [];
            $data['folders'] = $folders;
            $data['folder_meta'] = $folder_meta;
            if (saveData($data)) {
                $response['success'] = true;
                $response['message'] = 'Folder created successfully';
                $response['data'] = ['folder' => $full, 'folders' => $folders, 'folder_meta' => $folder_meta];
            } else {
                $response['message'] = 'Failed to save data';
            }
        } else {
            $response['message'] = 'Folder already exists';
        }
    }
    
    // Video and folder operations
    if (in_array($action, ['delete', 'rename', 'paste_copy', 'paste_cut'])) {
        $affectedFiles = [];
        $affectedFolders = [];
        $newVideos = $videos;
        
        // Handle files
        foreach ($_POST['file_ids'] ?? [] as $fid) {
            $index = array_search($fid, array_column($videos, 'file_id'));
            if ($index === false) continue;
            $affectedFiles[] = $fid;
            $video_data = $videos[$index];
            
            switch ($action) {
                case 'delete':
                    unset($newVideos[$index]);
                    unset($meta[$fid]);
                    break;
                case 'rename':
                    if (!empty($_POST['new_name'])) {
                        $newVideos[$index]['caption'] = trim($_POST['new_name']);
                        $meta[$fid]['caption'] = $newVideos[$index]['caption'];
                    }
                    break;
                case 'paste_cut':
                    $newVideos[$index]['folder'] = $destFolder;
                    $meta[$fid]['folder'] = $destFolder;
                    break;
                case 'paste_copy':
                    $newId = uniqid($fid . '_copy_');
                    $new_video_data = $video_data;
                    $new_video_data['file_id'] = $newId;
                    $new_video_data['folder'] = $destFolder;
                    $newVideos[] = $new_video_data;
                    $meta[$newId] = [
                        'caption' => $new_video_data['caption'],
                        'folder' => $new_video_data['folder']
                    ];
                    $affectedFiles[] = $newId;
                    break;
            }
        }
        
        // Handle folders
        foreach ($_POST['folder_ids'] ?? [] as $folder) {
            if (!in_array($folder, $folders)) continue;
            $affectedFolders[] = $folder;
            if ($action === 'delete') {
                $folders = array_filter($folders, fn($f) => $f !== $folder);
                unset($folder_meta[$folder]);
            }
        }
        
        $data['videos'] = array_values($newVideos);
        $data['folders'] = $folders;
        $data['folder_meta'] = $folder_meta;
        if (saveData($data)) {
            $response['success'] = true;
            $response['message'] = ucfirst($action) . ' completed successfully';
            $response['data'] = [
                'affectedFiles' => $affectedFiles,
                'affectedFolders' => $affectedFolders,
                'meta' => $meta,
                'folder_meta' => $folder_meta,
                'folders' => $folders
            ];
        } else {
            $response['message'] = 'Failed to save data';
        }
    }
    
    if ($isAjax) {
        echo json_encode($response);
        exit;
    } else {
        $redirect = $_POST['redirect_to'] ?? strtok($_SERVER["REQUEST_URI"], '?');
        header("Location: $redirect");
        exit;
    }
}

// GET parameters
$currentFolder = $_GET['folder'] ?? '';
$page = max(1, intval($_GET['page'] ?? 1));
$perPage = max(1, intval($_GET['per_page'] ?? 20));

// Filter + paginate
$filtered = array_filter($videos, function($v) use($meta, $currentFolder) {
    if ($currentFolder !== '' && ($meta[$v['file_id']]['folder'] ?? '') !== $currentFolder) return false;
    return true;
});
$total = count($filtered);
$maxPage = ceil($total / $perPage);
$start = ($page - 1) * $perPage;
$paged = array_slice($filtered, $start, $perPage);

// Compute immediate subfolders
$subfolders = [];
$prefix = $currentFolder === '' ? '' : ($currentFolder . '/');
foreach ($folders as $path) {
    if (strpos($path, $prefix) !== 0) continue;
    $rest = substr($path, strlen($prefix));
    if ($rest === '') continue;
    $part = explode('/', $rest)[0];
    $full = $prefix . $part;
    $subfolders[$full] = $part;
}
ksort($subfolders);
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>My Videos</title>
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <link rel="stylesheet" href="css/styles.css">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <style>
        #clipboardStatus {
            margin-bottom: 10px;
            font-size: 14px;
            color: var(--accent);
            background: var(--panel);
            padding: 8px;
            border-radius: 4px;
        }
        #breadcrumbs {
            margin-bottom: 10px;
            font-size: 14px;
        }
        #breadcrumbs a {
            color: var(--accent);
            text-decoration: none;
            margin-right: 5px;
        }
        #breadcrumbs a:hover {
            background: var(--hover);
        }
        #breadcrumbs span {
            color: var(--muted);
            margin-right: 5px;
        }
        .modal {
            display: none;
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: var(--panel);
            padding: 20px;
            border-radius: 4px;
            box-shadow: 0 0 10px rgba(0, 0, 0, 0.5);
            z-index: 1000;
            color: var(--fg);
        }
        .modal input, .modal select {
            width: 100%;
            padding: 8px;
            margin-bottom: 10px;
            background: var(--input);
            border: none;
            border-radius: 4px;
            color: var(--fg);
        }
        .modal button {
            background: var(--accent);
            color: #fff;
            padding: 6px 12px;
            border: none;
            border-radius: 4px;
            cursor: pointer;
        }
        .modal button:hover {
            background: var(--hover);
        }
        #modalOverlay {
            display: none;
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.7);
            z-index: 999;
        }
        .video-link {
            color: var(--accent);
            text-decoration: none;
        }
        .video-link:hover {
            text-decoration: underline;
        }
    </style>
    <script>
        // Expose data to JS
        const CURRENT_FOLDER = <?= json_encode($currentFolder) ?>;
        const VIDEOS = <?= json_encode($videos) ?>;
        const META = <?= json_encode($meta) ?>;
        const FOLDERS = <?= json_encode($folders) ?>;
    </script>
</head>
<body>
<header>
    <h1><i class="fa fa-video"></i> My Videos</h1>
    <span class="file-count">Active Files</span>
</header>

<div class="container" id="cont">
    <div id="clipboardStatus"></div>
    <nav id="breadcrumbs">
        <a href="?">Root</a>
        <?php if ($currentFolder):
            $parts = explode('/', $currentFolder);
            $path = '';
            foreach ($parts as $i => $part):
                $path .= ($i > 0 ? '/' : '') . $part;
                ?>
                <span>></span>
                <a href="?folder=<?= urlencode($path) ?>"><?= htmlspecialchars($part) ?></a>
            <?php endforeach; endif; ?>
    </nav>

    <input type="text" id="search" placeholder="🔍 Search files…">

    <div class="controls">
        <div class="results-per-page-container">
            <label for="perPageSelect">Show</label>
            <form method="GET" style="display:inline">
                <?php if ($currentFolder !== ''): ?>
                    <input type="hidden" name="folder" value="<?= htmlspecialchars($currentFolder) ?>">
                <?php endif; ?>
                <select name="per_page" id="perPageSelect" onchange="this.form.submit()">
                    <?php foreach ([10, 20, 50, 100] as $n): ?>
                        <option value="<?= $n ?>" <?= $perPage == $n ? 'selected' : '' ?>><?= $n ?></option>
                    <?php endforeach; ?>
                    <option value="custom">Custom</option>
                </select>
                <input type="number" id="customInput" name="per_page"
                       placeholder="Custom" min="1" style="display:none;width:60px">
            </form>
        </div>
        <div class="total">Total: <span id="totalCount"><?= $total ?></span></div>
    </div>

    <div id="selectionInfo">Selected: 0 files, 0 folders</div>

    <form id="batchForm" style="display:none">
        <!-- JS will use this for AJAX -->
    </form>
    <div class="toolbar">
        <button type="button" onclick="cut()"><i class="fa fa-cut"></i> Cut</button>
        <button type="button" onclick="copyItems()"><i class="fa fa-copy"></i> Copy</button>
        <button id="btnPaste" type="button" onclick="paste()" disabled>
            <i class="fa fa-clipboard"></i> Paste
        </button>
        <button type="button" onclick="batch('delete')">
            <i class="fa fa-trash-alt"></i> Delete
        </button>
        <button type="button" id="msToggle" onclick="toggleMultiSelect()">
            <i class="fa fa-check-square"></i> Select
        </button>
        <button type="button" onclick="showRenameModal()">
            <i class="fa fa-pen"></i> Rename
        </button>
        <button type="button" onclick="showCreateFolderModal()">
            <i class="fa fa-folder-plus"></i> New Folder
        </button>
        <button type="button" onclick="refreshPage()">
            <i class="fa fa-sync"></i> Refresh
        </button>
    </div>

    <!-- Modals -->
    <div id="modalOverlay"></div>
    <div id="renameModal" class="modal">
        <h3>Rename</h3>
        <input type="text" id="renameInput" placeholder="New name">
        <button type="button" onclick="rename()">Rename</button>
        <button type="button" onclick="hideModal('renameModal')">Cancel</button>
    </div>
    <div id="createFolderModal" class="modal">
        <h3>Create Folder</h3>
        <input type="text" id="folderNameInput" placeholder="Folder name">
        <select id="parentFolderSelect">
            <option value="">Root</option>
            <?php foreach ($folders as $folder): ?>
                <option value="<?= htmlspecialchars($folder) ?>"><?= htmlspecialchars($folder) ?></option>
            <?php endforeach; ?>
        </select>
        <button type="button" onclick="createFolder()">Create</button>
        <button type="button" onclick="hideModal('createFolderModal')">Cancel</button>
    </div>

    <?php if (empty($subfolders) && empty($paged)): ?>
        <div class="empty">No items found.</div>
    <?php else: ?>
        <table id="videoTable">
            <thead>
                <tr>
                    <th class="checkbox-col"><input type="checkbox" id="selectAllCheckbox" onclick="selectAll(this)"></th>
                    <th>Name</th><th>Res</th><th>Size</th><th>ID</th><th>Folder</th>
                </tr>
            </thead>
            <tbody id="videoTableBody">
                <?php foreach ($subfolders as $path => $name): ?>
                    <tr data-type="folder" data-path="<?= htmlspecialchars($path) ?>">
                        <td class="checkbox-col"><input class="item-cb folder-cb" data-type="folder" type="checkbox" value="<?= htmlspecialchars($path) ?>"></td>
                        <td><i class="fa fa-folder"></i> <a href="?folder=<?= urlencode($path) ?>"><?= htmlspecialchars($name) ?></a></td>
                        <td colspan="3"></td>
                        <td><?= htmlspecialchars($currentFolder ?: '/') ?></td>
                    </tr>
                <?php endforeach; ?>

                <?php foreach ($paged as $v):
                    $fid = $v['file_id'];
                    $m = $meta[$fid] ?? ['caption' => '', 'folder' => ''];
                    $cap = $m['caption'] ?: $v['caption'];
                    $short = strlen($fid) > 15 ? substr($fid, 0, 15) . '…' : $fid;
                    ?>
                    <tr data-type="video" data-fid="<?= htmlspecialchars($fid) ?>">
                        <td class="checkbox-col"><input class="item-cb vid" type="checkbox" value="<?= htmlspecialchars($fid) ?>"></td>
                        <td data-label="Name"><a href="watch.php?fid=<?= urlencode($fid) ?>" class="video-link"><?= htmlspecialchars($cap) ?></a></td>
                        <td data-label="Res"><?= htmlspecialchars($v['resolution']) ?></td>
                        <td data-label="Size"><?= htmlspecialchars($v['size']) ?></td>
                        <td data-label="ID">
                            <?php if (strlen($fid) > 15): ?>
                                <span class="short"><?= htmlspecialchars($short) ?></span>
                                <span class="full" style="display:none"><?= htmlspecialchars($fid) ?></span>
                                <a href="#" class="toggle">Show more</a>
                            <?php else: ?>
                                <?= htmlspecialchars($fid) ?>
                            <?php endif; ?>
                        </td>
                        <td data-label="Folder"><?= htmlspecialchars($m['folder'] ?? '') ?></td>
                    </tr>
                <?php endforeach; ?>
            </tbody>
        </table>

        <?php if ($maxPage > 1): ?>
            <div class="pagination">
                <a href="?page=<?= max(1, $page - 1) ?>&per_page=<?= $perPage ?><?= $currentFolder ? ('&folder=' . urlencode($currentFolder)) : '' ?>">«</a>
                <span><?= $page ?></span>
                <a href="?page=<?= min($maxPage, $page + 1) ?>&per_page=<?= $perPage ?><?= $currentFolder ? ('&folder=' . urlencode($currentFolder)) : '' ?>">»</a>
                <a href="?page=<?= $maxPage ?>&per_page=<?= $perPage ?><?= $currentFolder ? ('&folder=' . urlencode($currentFolder)) : '' ?>"><?= $maxPage ?></a>
            </div>
        <?php endif; ?>
    <?php endif; ?>
</div>
<script src="js/main.js"></script>
</body>
</html>