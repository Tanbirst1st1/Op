#!/bin/bash

# Usage: ./gdrive-download.sh "https://drive.google.com/file/d/FILE_ID/view"

if [ -z "$1" ]; then
  echo "Usage: $0 'https://drive.google.com/file/d/FILE_ID/view?...'"
  exit 1
fi

LINK="$1"

# Extract the FILE ID from the link
FILEID=$(echo "$LINK" | grep -oP '(?<=/d/)[a-zA-Z0-9_-]+')

if [ -z "$FILEID" ]; then
  echo "Error: Could not extract file ID from the link."
  exit 1
fi

# First request to get confirmation token and filename
CONFIRM=$(wget --quiet --save-cookies cookies.txt --keep-session-cookies \
"https://docs.google.com/uc?export=download&id=$FILEID" -O- | \
sed -rn 's/.*confirm=([0-9A-Za-z_]+).*/\1/p')

FILENAME=$(wget --quiet --save-cookies cookies.txt --keep-session-cookies \
"https://docs.google.com/uc?export=download&id=$FILEID" --content-disposition -O /dev/null 2>&1 | \
grep -oE 'filename=.*' | sed -e 's/filename=//')

# If confirm token exists, it's a large file
if [ -n "$CONFIRM" ]; then
  echo "Large file detected. Downloading..."
  wget --load-cookies cookies.txt \
  "https://docs.google.com/uc?export=download&confirm=$CONFIRM&id=$FILEID" \
  --content-disposition -O "${FILENAME:-downloaded_file}"
else
  echo "Small file detected. Downloading..."
  wget --no-check-certificate "https://docs.google.com/uc?export=download&id=$FILEID" \
  --content-disposition -O "${FILENAME:-downloaded_file}"
fi

rm -f cookies.txt
echo "Download completed: ${FILENAME:-downloaded_file}"
