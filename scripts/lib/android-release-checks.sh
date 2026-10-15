# Sourced by check-android-release.sh and its test.

# Reads `readelf -lW` output on stdin; prints the smallest LOAD alignment in bytes, or 0 when there is none.
min_load_align() {
  awk '$1 == "LOAD" { a = strtonum($NF); if (min == "" || a < min) min = a } END { print (min == "" ? 0 : min) }'
}

# target_ok <targetSdk> <minimum>: succeeds when the targetSdk is a number at least the minimum.
target_ok() {
  [[ "$1" =~ ^[0-9]+$ ]] && [ "$1" -ge "$2" ]
}
