#!/usr/bin/env bash
# Download the full MaleCNS v1.0 connectome (about 1.1 GB) from Janelia's
# public bucket. You only need this if you want to explore beyond the
# 318-neuron slice that ships with this repo.
#
# Licence: CC BY 4.0. Credit: FlyEM / HHMI Janelia, University of Cambridge,
# MRC LMB, Google Research. https://male-cns.janelia.org/download/
#
# Usage: bash tools/download_full_dataset.sh [output-folder]

set -euo pipefail
OUT="${1:-full-dataset}"
BASE="https://storage.googleapis.com/flyem-male-cns/v1.0/connectome-data/flat-connectome"
mkdir -p "$OUT"
for f in \
  body-annotations-male-cns-v1.0-minconf-0.5.feather \
  body-neurotransmitters-male-cns-v1.0.feather \
  connectome-weights-male-cns-v1.0-minconf-0.5.feather
do
  echo "Downloading $f ..."
  curl -L --fail -C - -o "$OUT/$f" "$BASE/$f"
done
echo "Done. Files are in $OUT/ (Apache Arrow .feather format; open with pandas.read_feather)."
