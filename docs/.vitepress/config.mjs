import { defineConfig } from 'vitepress'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const docsRoot = path.join(__dirname, '../')

// ---------- 自动扫描文件夹生成侧边栏 ----------
function getAutoItems(folder) {
  const folderPath = path.join(docsRoot, folder)
  if (!fs.existsSync(folderPath)) return []
  
  const files = fs.readdirSync(folderPath)
    .filter(f => f.endsWith('.md') && f !== 'index.md')
    .sort()

  return files.map(f => ({
    text: f.replace(/\.md$/, '').replace(/^\d+_/, ''),
    link: `/${folder}/${f.replace(/\.md$/, '')}`
  }))
}

// ---------- 自动生成 index.md 内容 ----------
function generateAutoIndex(folder) {
  const items = getAutoItems(folder)
  if (items.length === 0) {
    return `# ${folder}\n\n暂无笔记，正在陆续添加中...\n`
  }
  
  let content = `# ${folder}\n\n本目录收录以下笔记：\n\n`
  items.forEach(item => {
    content += `- [${item.text}](${item.link})\n`
  })
  content += `\n---\n*共 ${items.length} 篇笔记*\n`
  return content
}

// ---------- 站点配置 ----------
export default defineConfig({
  title: "FMC-Notes",
  description: "FMC 的运维笔记",
  lang: 'zh-CN',

  // ⭐ 关键：自动为每个文件夹生成 index.md 内容
  async transformPageData(pageData) {
    // 如果是某个分类文件夹的根路径（如 /Linux/）
    const folders = ['Linux', 'Mysql', 'PostgreSQL', 'Redis', 'Nginx', 
                     'Docker', 'Zabbix', 'Ansible', 'K3S', 'K8S', 
                     'Prometheus', 'Grafana', 'Jenkins', '运维工具']
    
    for (const folder of folders) {
      if (pageData.relativePath === `${folder}/index.md`) {
        // 用自动生成的内容替换原本的 index.md
        pageData.content = generateAutoIndex(folder)
        break
      }
    }
    return pageData
  },

  themeConfig: {
    nav: [
      { text: '首页', link: '/' },
      { text: 'Linux', link: '/Linux/' },
      { text: 'Mysql', link: '/Mysql/' },
      { text: 'Nginx', link: '/Nginx/' },
      { text: 'PostgreSQL', link: '/PostgreSQL/' },
      { text: 'Redis', link: '/Redis/' },
      { text: 'Docker', link: '/Docker/' },
      { text: 'Ansible', link: '/Ansible/' },
      { text: 'Zabbix', link: '/Zabbix/' },
      { text: 'K3S', link: '/K3S/' },
      { text: 'K8S', link: '/K8S/' },
      { text: 'Prometheus', link: '/Prometheus/' },
      { text: 'Grafana', link: '/Grafana/' },
      { text: 'Jenkins', link: '/Jenkins/' },
      { text: '运维工具', link: '/运维工具/' },
    ],

    sidebar: {
      '/Linux/': [{ text: 'Linux', collapsed: false, items: getAutoItems('Linux') }],
      '/Mysql/': [{ text: 'MySQL', collapsed: false, items: getAutoItems('Mysql') }],
      '/PostgreSQL/': [{ text: 'PostgreSQL', collapsed: false, items: getAutoItems('PostgreSQL') }],
      '/Redis/': [{ text: 'Redis', collapsed: false, items: getAutoItems('Redis') }],
      '/Nginx/': [{ text: 'Nginx', collapsed: false, items: getAutoItems('Nginx') }],
      '/Docker/': [{ text: 'Docker', collapsed: false, items: getAutoItems('Docker') }],
      '/Zabbix/': [{ text: 'Zabbix', collapsed: false, items: getAutoItems('Zabbix') }],
      '/Ansible/': [{ text: 'Ansible', collapsed: false, items: getAutoItems('Ansible') }],
      '/K3S/': [{ text: 'K3s', collapsed: false, items: getAutoItems('K3S') }],
      '/K8S/': [{ text: 'Kubernetes', collapsed: false, items: getAutoItems('K8S') }],
      '/Prometheus/': [{ text: 'Prometheus', collapsed: false, items: getAutoItems('Prometheus') }],
      '/Grafana/': [{ text: 'Grafana', collapsed: false, items: getAutoItems('Grafana') }],
      '/Jenkins/': [{ text: 'Jenkins', collapsed: false, items: getAutoItems('Jenkins') }],
      '/运维工具/': [{ text: '运维工具', collapsed: false, items: getAutoItems('运维工具') }],
    },
    search: {
    provider: 'local',
    options: {
      placeholder: '搜索文档...',
      translations: {
        button: {
          buttonText: '搜索文档',
          buttonAriaLabel: '搜索文档'
        },
        modal: {
          noResultsText: '未找到相关结果',
          resetButtonTitle: '清除查询条件',
          footer: {
            selectText: '选择',
            navigateText: '切换',
            closeText: '关闭'
          }
        }
      }
    }
  },	  

   // ⭐ 添加最后更新时间
   lastUpdated: {
      text: '最后更新于',
      formatOptions: {
        dateStyle: 'full',
        timeStyle: 'medium'
      }
    },
  // ⭐ 新增：大纲标题改为中文
   outline: {
    label: '大纲'
  },
   // ⭐ 底部导航改成中文
   docFooter: {
    prev: '上一篇',
    next: '下一篇'
  }	  
  }
})
