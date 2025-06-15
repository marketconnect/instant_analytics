import React from 'react';
import type { ImportStatus } from '../../types/analytics';

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

  return (
    <div className="card">
      <h3>📁 Загрузка данных</h3>
      <input
        type="file"
        accept=".csv,.parquet,.xlsx"
        onChange={handleFileChange}
        disabled={isLoading}
        style={{ marginBottom: '10px' }}
      />
     
      {importStatus.message && (
        <div style={{ 
          marginTop: '10px', 
          fontWeight: 'bold',
          color: importStatus.status === 'error' ? '#dc3545' : 
                 importStatus.status === 'success' ? '#28a745' : '#007bff'
        }}>
          {importStatus.message}
        </div>
      )}
    </div>
  );
};

export default FileUploader; 