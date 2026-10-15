# Checks store-listing limits. Apple counts keywords in bytes, so Arabic counts twice per letter.
ROOT = File.expand_path("metadata", __dir__)

LIMITS = {
  "android/%s/title.txt" => [:chars, 30],
  "android/%s/short_description.txt" => [:chars, 80],
  "android/%s/full_description.txt" => [:chars, 4000],
  "android/%s/changelogs/*.txt" => [:chars, 500],
  "ios/%s/name.txt" => [:chars, 30],
  "ios/%s/subtitle.txt" => [:chars, 30],
  "ios/%s/description.txt" => [:chars, 4000],
  "ios/%s/keywords.txt" => [:bytes, 100],
  "ios/%s/promotional_text.txt" => [:chars, 170],
  "ios/%s/release_notes.txt" => [:chars, 4000]
}.freeze
LOCALES = { "android" => %w[en-US ar], "ios" => %w[en-US ar-SA] }.freeze
URLS = {
  "en-US" => { "privacy_url.txt" => "https://lexnur.com/privacy", "support_url.txt" => "https://lexnur.com/support", "marketing_url.txt" => "https://lexnur.com" },
  "ar-SA" => { "privacy_url.txt" => "https://lexnur.com/ar/privacy", "support_url.txt" => "https://lexnur.com/ar/support", "marketing_url.txt" => "https://lexnur.com" }
}.freeze

errors = []
LIMITS.each do |pattern, (unit, max)|
  LOCALES.fetch(pattern.split("/").first).each do |locale|
    expected = File.join(ROOT, format(pattern, locale))
    paths = pattern.include?("*") ? Dir[expected].sort : [expected]
    errors << "missing #{expected}" if paths.empty?
    paths.each do |path|
      unless File.exist?(path)
        errors << "missing #{path}"
        next
      end
      text = File.read(path, encoding: "UTF-8").strip
      size = unit == :bytes ? text.bytesize : text.length
      errors << "#{path}: empty" if size.zero?
      errors << "#{path}: #{size} #{unit} > #{max}" if size > max
      if pattern.end_with?("keywords.txt") && text.split(",").any? { |k| k.strip != k || k.empty? }
        errors << "#{path}: keywords must be comma-separated without spaces around commas"
      end
    end
  end
end
URLS.each do |locale, files|
  files.each do |name, url|
    path = File.join(ROOT, "ios", locale, name)
    actual = File.exist?(path) ? File.read(path).strip : nil
    errors << "#{path}: expected #{url}, got #{actual.inspect}" unless actual == url
  end
end
%w[copyright.txt primary_category.txt secondary_category.txt].each do |name|
  errors << "missing ios/#{name}" unless File.exist?(File.join(ROOT, "ios", name))
end

if errors.empty?
  puts "metadata OK"
else
  puts errors
  exit 1
end
