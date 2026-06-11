# Modal 组件调用清单

本报告列出项目中 `src/components` 下所有 `*Modal` 组件及其在代码中的调用位置，便于识别相同界面从不同位置调用的问题。

注意：文件路径为工作区相对路径，点击可在编辑器中打开对应文件。

- `src/components/EquipmentDetailModal.tsx` — 调用方：
  - [src/pages/Index.tsx](src/pages/Index.tsx)
  - [src/pages/CalibrationDashboard.tsx](src/pages/CalibrationDashboard.tsx)
  - [src/components/EquipmentTypeManager.tsx](src/components/EquipmentTypeManager.tsx)
  - [src/components/MaintenanceDashboard.tsx](src/components/MaintenanceDashboard.tsx)

- `src/components/TableImportModal.tsx` — 调用方：
  - [src/pages/Index.tsx](src/pages/Index.tsx)
  - [src/components/EquipmentTableView.tsx](src/components/EquipmentTableView.tsx)

- `src/components/TableConfigModal.tsx` — 调用方：
  - [src/pages/Index.tsx](src/pages/Index.tsx)

- `src/components/StatusSelectModal.tsx` — 调用方：
  - [src/pages/Index.tsx](src/pages/Index.tsx)
  - [src/components/EquipmentDetailModal.tsx](src/components/EquipmentDetailModal.tsx)

- `src/components/SmartOCRModal.tsx` — 调用方：
  - [src/pages/Index.tsx](src/pages/Index.tsx)

- `src/components/ScrapEquipmentModal.tsx` — 调用方：
  - [src/pages/Index.tsx](src/pages/Index.tsx)
  - [src/components/EquipmentDetailModal.tsx](src/components/EquipmentDetailModal.tsx)

- `src/components/QRScannerModal.tsx` — 调用方：
  - [src/pages/Index.tsx](src/pages/Index.tsx)

- `src/components/QRCodeModal.tsx` — 调用方：
  - [src/pages/Index.tsx](src/pages/Index.tsx)

- `src/components/PartQRScannerModal.tsx` — 调用方：
  - [src/pages/PartsManagement.tsx](src/pages/PartsManagement.tsx)

- `src/components/PartTransactionModal.tsx` — 调用方：
  - [src/pages/PartsManagement.tsx](src/pages/PartsManagement.tsx)

- `src/components/ImageOCRModal.tsx` — 调用方：
  - [src/components/AddPartModal.tsx](src/components/AddPartModal.tsx)

- `src/components/GlassModal.tsx` — 调用方（示例）：
  - [src/components/EquipmentTypeManager.tsx](src/components/EquipmentTypeManager.tsx)
  - [src/components/MaintenanceScheduleManager.tsx](src/components/MaintenanceScheduleManager.tsx)
  - [src/components/shared/EquipmentPickerDialog.tsx](src/components/shared/EquipmentPickerDialog.tsx)
  - [src/components/shared/MaintenanceScheduleFormDialog.tsx](src/components/shared/MaintenanceScheduleFormDialog.tsx)

- `src/components/FaultReportModal.tsx` — 调用方：
  - [src/components/EquipmentDetailModal.tsx](src/components/EquipmentDetailModal.tsx)

- `src/components/AddPartModal.tsx` — 调用方：
  - [src/pages/PartsManagement.tsx](src/pages/PartsManagement.tsx)

- `src/components/AddEquipmentToGroupModal.tsx` — 调用方：
  - [src/components/MaintenanceDashboard.tsx](src/components/MaintenanceDashboard.tsx)

- `src/components/AddEquipmentModal.tsx` — 调用方：
  - [src/pages/Index.tsx](src/pages/Index.tsx)

- `src/components/BatchDateEditModal.tsx` — 调用方：
  - [src/pages/Index.tsx](src/pages/Index.tsx)


后续建议：

- 优先检查 `EquipmentDetailModal` 的不同调用处是否在传入 props / 处理回调上存在差异；考虑统一入口或使用 Context 管理。  
- 评估 `SmartOCRModal` 与 `ImageOCRModal`、`QRScannerModal` 与 `PartQRScannerModal` 的功能重叠，若多数逻辑可复用则合并为参数化组件。  
- 若需要，我可以继续逐文件打开这些组件的实现并生成更具体的重构补丁。

生成人：代码分析自动报告
日期：2026-06-07
