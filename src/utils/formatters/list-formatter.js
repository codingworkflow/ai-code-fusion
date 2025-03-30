/**
 * Utility functions for converting between YAML and plain text formats for 
 * include_extensions and exclude_patterns in the config
 */

/**
 * Converts a YAML array section to plain text format (one item per line)
 * 
 * @param {Array} arrayItems - Array of items from the YAML config
 * @returns {string} Plain text representation with one item per line
 */
export function yamlArrayToPlainText(arrayItems) {
  if (!arrayItems || !Array.isArray(arrayItems)) {
    return '';
  }
  
  // Process each item to remove quotes and trim
  const cleanedItems = arrayItems.map(item => {
    // Remove surrounding quotes if present
    let cleanItem = item.toString();
    if ((cleanItem.startsWith('"') && cleanItem.endsWith('"')) || 
        (cleanItem.startsWith("'") && cleanItem.endsWith("'"))) {
      cleanItem = cleanItem.substring(1, cleanItem.length - 1);
    }
    return cleanItem.trim();
  });
  
  // Join processed items with newlines
  return cleanedItems.join('\n');
}

/**
 * Converts plain text (one item per line) to an array for YAML
 * 
 * @param {string} plainText - Text with one item per line
 * @returns {Array} Array of items for YAML config
 */
export function plainTextToYamlArray(plainText) {
  if (!plainText) {
    return [];
  }
  
  // Split by newlines, trim, and filter empty lines
  return plainText
    .split('\n')
    .map(line => {
      // Clean each line by removing excess spaces and quotes
      let cleanLine = line.trim();
      // Only remove quotes that are at both the beginning and end
      if ((cleanLine.startsWith('"') && cleanLine.endsWith('"')) || 
          (cleanLine.startsWith("'") && cleanLine.endsWith("'"))) {
        cleanLine = cleanLine.substring(1, cleanLine.length - 1);
      }
      return cleanLine.trim();
    })
    .filter(line => line.length > 0);
}

/**
 * Extracts array items from YAML format
 * 
 * @param {string} yamlContent - YAML content containing a list
 * @param {string} arrayKey - The key for the array in the YAML object
 * @returns {Array} Array of items extracted from the YAML
 */
export function extractArrayFromYaml(yamlContent, arrayKey) {
  // Look for the array key and extract items
  const lines = yamlContent.split('\n');
  let items = [];
  let inArray = false;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Check if we're starting the array section
    if (line.trim().startsWith(arrayKey + ':')) {
      inArray = true;
      continue;
    }
    
    // If we're in the array section, extract items
    if (inArray && line.trim().startsWith('-')) {
      const item = line.replace('-', '').trim();
      items.push(item);
    }
    
    // If we've moved to a new section (not indented), stop processing
    if (inArray && line.trim() !== '' && !line.trim().startsWith('-') && !line.startsWith(' ')) {
      break;
    }
  }
  
  return items;
}
