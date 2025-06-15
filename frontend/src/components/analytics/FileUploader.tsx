import React from 'react';
import type { ImportStatus } from '../../types/analytics';
import styles from './FileUploader.module.css';

interface FileUploaderProps {
  onFileUpload: (file: File) => Promise<void>;
  importStatus: ImportStatus;
  isLoading: boolean;
}

const FileUploader: React.FC<FileUploaderProps> = ({
  onFileUpload,
  importStatus,
  isLoading
}) => {
  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      try {
        await onFileUpload(file);
      } catch (error) {
        console.error('File upload error:', error);
        // Error уже обрабатывается в хуке
      }
    }
  };

  const getStatusClass = () => {
    switch (importStatus.status) {
      case 'error': return styles.error;
      case 'success': return styles.success;
      default: return styles.loading;
    }
  };

  return (
    <div className={styles.card}>
      <h3>📁 Загрузка данных</h3>
      <input
        type="file"
        accept=".csv,.parquet,.xlsx"
        onChange={handleFileChange}
        disabled={isLoading}
        className={styles.fileInput}
      />
     
      {importStatus.message && (
        <div className={`${styles.statusMessage} ${getStatusClass()}`}>
          {importStatus.message}
        </div>
      )}
    </div>
  );
};

export default FileUploader; 