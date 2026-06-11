const fs = require('fs');
const path = require('path');

const PROJECT_ID = 'uvylubaxpkmzymdggoyf';
const API_URL = `https://${PROJECT_ID}.supabase.co`;
// Supabase 的 SQL 编辑器 API - 需要有效的认证
// 这个脚本会尝试通过管理 API 执行 SQL

async function executeMigration() {
  try {
    console.log('正在读取迁移文件...');
    const migrationPath = path.join(__dirname, 'supabase', 'migrations', '20260607_add_equipment_maintenance_hierarchy.sql');
    const sql = fs.readFileSync(migrationPath, 'utf8');
    
    console.log('迁移文件内容长度:', sql.length);
    console.log('迁移文件路径:', migrationPath);
    console.log('\n=== 迁移 SQL 内容预览 ===');
    console.log(sql.substring(0, 300) + '...\n');
    
    console.log('⚠️  注意：需要在 Supabase 管理界面手动执行 SQL');
    console.log('请访问: https://app.supabase.com/project/' + PROJECT_ID + '/sql/new');
    console.log('\n将以下 SQL 复制到编辑器并执行：\n');
    console.log('='.repeat(80));
    console.log(sql);
    console.log('='.repeat(80));
    
    console.log('\n✓ 迁移文件已准备就绪，请在 Supabase SQL 编辑器中执行上述 SQL');
    
  } catch (err) {
    console.error('读取失败:', err);
  }
}

executeMigration();
