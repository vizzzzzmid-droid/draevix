const hasFilesInDataTransfer = (dataTransfer: DataTransfer | null): boolean => {
  if (!dataTransfer) return false;

  return (
    dataTransfer.types.includes('Files') ||
    dataTransfer.files.length > 0 ||
    Array.from(dataTransfer.items).some((item) => item.kind === 'file')
  );
};

const getFilesFromDataTransfer = (
  dataTransfer: DataTransfer | null
): File[] => {
  if (!dataTransfer) return [];

  const files = Array.from(dataTransfer.files);

  if (files.length > 0) return files;

  return Array.from(dataTransfer.items).flatMap((item) => {
    if (item.kind !== 'file') return [];

    const file = item.getAsFile();

    return file ? [file] : [];
  });
};

export { getFilesFromDataTransfer, hasFilesInDataTransfer };
