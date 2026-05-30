import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

type Language = 'zh' | 'en';

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string) => string;
}

const translations = {
  zh: {
    // Header
    'lab.equipment.management': '实验室设备管理系统',
    'search.placeholder': '搜索设备名称、型号或位置...',
    'all.status': '全部状态',
    'available': '可用',
    'maintenance': '维护中',
    'retired': '已退役',
    'add.equipment': '添加设备',
    'import.data': '导入数据',
    'scan.qr': '扫描二维码',
    'table.config': '表格配置',
    'card.view': '卡片视图',
    'table.view': '表格视图',
    
    // Equipment status
    'status.available': '可用',
    'status.maintenance': '维护中',
    'status.retired': '已退役',
    
    // Common actions
    'edit': '编辑',
    'delete': '删除',
    'view.details': '查看详情',
    'cancel': '取消',
    'confirm': '确认',
    'save': '保存',
    'close': '关闭',
    
    // Import modal
    'import.title': '导入设备数据',
    'upload.file': '上传文件',
    'column.mapping': '列映射',
    'preview.data': '预览数据',
    'import.success': '导入成功',
    'select.file': '选择Excel或CSV文件',
    'drag.drop': '或拖拽文件到此处',
    'supported.formats': '支持 .xlsx, .xls, .csv 格式',
    
    // Equipment fields
    'equipment.id': '设备编号',
    'equipment.name': '设备名称',
    'model': '型号',
    'serial.number': '序列号',
    'manufacturer': '制造商',
    'location': '位置',
    'type': '类型',
    'status': '状态',
    'description': '描述',
    'responsible': '负责人',
    'maintenance.date': '维护日期',
    'asset.number': '资产编号',
    'calibration.cycle': '校准周期',
    'last.calibration': '上次校准',
    'next.calibration': '下次校准',
    
    // Messages
    'no.equipment.found': '未找到设备',
    'loading': '加载中...',
    'error.occurred': '发生错误',
    'data.saved': '数据已保存',
    'language.switch': '语言切换'
  },
  en: {
    // Header
    'lab.equipment.management': 'Laboratory Equipment Management System',
    'search.placeholder': 'Search equipment name, model or location...',
    'all.status': 'All Status',
    'available': 'Available',
    'maintenance': 'Maintenance',
    'retired': 'Retired',
    'add.equipment': 'Add Equipment',
    'import.data': 'Import Data',
    'scan.qr': 'Scan QR Code',
    'table.config': 'Table Config',
    'card.view': 'Card View',
    'table.view': 'Table View',
    
    // Equipment status
    'status.available': 'Available',
    'status.maintenance': 'Maintenance',
    'status.retired': 'Retired',
    
    // Common actions
    'edit': 'Edit',
    'delete': 'Delete',
    'view.details': 'View Details',
    'cancel': 'Cancel',
    'confirm': 'Confirm',
    'save': 'Save',
    'close': 'Close',
    
    // Import modal
    'import.title': 'Import Equipment Data',
    'upload.file': 'Upload File',
    'column.mapping': 'Column Mapping',
    'preview.data': 'Preview Data',
    'import.success': 'Import Successful',
    'select.file': 'Select Excel or CSV file',
    'drag.drop': 'or drag and drop file here',
    'supported.formats': 'Supports .xlsx, .xls, .csv formats',
    
    // Equipment fields
    'equipment.id': 'Equipment ID',
    'equipment.name': 'Equipment Name',
    'model': 'Model',
    'serial.number': 'Serial Number',
    'manufacturer': 'Manufacturer',
    'location': 'Location',
    'type': 'Type',
    'status': 'Status',
    'description': 'Description',
    'responsible': 'Responsible',
    'maintenance.date': 'Maintenance Date',
    'asset.number': 'Asset Number',
    'calibration.cycle': 'Calibration Cycle',
    'last.calibration': 'Last Calibration',
    'next.calibration': 'Next Calibration',
    
    // Messages
    'no.equipment.found': 'No equipment found',
    'loading': 'Loading...',
    'error.occurred': 'An error occurred',
    'data.saved': 'Data saved',
    'language.switch': 'Language Switch'
  }
};

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

interface LanguageProviderProps {
  children: ReactNode;
}

export const LanguageProvider = ({ children }: LanguageProviderProps) => {
  const [language, setLanguage] = useState<Language>('zh');

  useEffect(() => {
    const savedLanguage = localStorage.getItem('lab-language') as Language;
    if (savedLanguage && (savedLanguage === 'zh' || savedLanguage === 'en')) {
      setLanguage(savedLanguage);
    }
  }, []);

  const handleSetLanguage = (lang: Language) => {
    setLanguage(lang);
    localStorage.setItem('lab-language', lang);
  };

  const t = (key: string): string => {
    return translations[language][key as keyof typeof translations[typeof language]] || key;
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage: handleSetLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = () => {
  const context = useContext(LanguageContext);
  if (context === undefined) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
};