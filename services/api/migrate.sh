#!/bin/bash
set -euo pipefail

echo "▶ 1. マイグレーション用ディレクトリを作成します..."
TS="$(date +%Y%m%d%H%M%S)"
MIGDIR="prisma/migrations/${TS}_fix_jobs"
mkdir -p "$MIGDIR"

echo "▶ 2. 差分SQLファイルを生成します..."
npx prisma migrate diff \
  --from-url "$DATABASE_URL" \
  --to-schema-datamodel ./prisma/schema.prisma \
  --script > "$MIGDIR/migration.sql"

echo "✅ SQLスクリプトが生成されました: $MIGDIR/migration.sql"
echo "--------------------------------------------------"

echo "👀 生成されたSQLの要約を確認します:"
grep -nE 'ALTER TABLE|CREATE TABLE|DROP TABLE|source_uri' "$MIGDIR/migration.sql" || echo "（特定のキーワードに一致する行はありませんでした）"
echo "--------------------------------------------------"
echo "🕒 10秒後に、データベースへの適用を自動的に開始します。中止する場合は Ctrl+C を押してください。"
sleep 10

echo "🚀 データベースへ変更を適用します..."
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$MIGDIR/migration.sql"
echo "✅ データベースへの適用が完了しました。"
echo "--------------------------------------------------"

echo "🧐 最終確認: 'jobs'テーブルの新しい構造を表示します。"
psql "$DATABASE_URL" -c '\d+ jobs'
echo "--------------------------------------------------"
echo "🎉 全ての工程が完了しました！"
