# CSV Structure Analysis Script
import csv
import json
from pathlib import Path
from typing import Dict, List, Any, Optional

class CSVAnalyzer:
    def __init__(self, csv_path: str):
        self.csv_path = Path(csv_path)
        self.headers = []
        self.sample_data = []
        self.column_types = {}
        self.max_lengths = {}
        self.null_counts = {}
        self.normalized_fields = {}
    
    def analyze(self) -> Dict[str, Any]:
        """Analyze CSV structure and suggest schema"""
        with open(self.csv_path, 'r', encoding='utf-8') as f:
            reader = csv.DictReader(f)
            self.headers = reader.fieldnames
            
            # Sample first 100 rows for analysis
            for i, row in enumerate(reader):
                if i < 100:
                    self.sample_data.append(row)
                else:
                    break
        
        self._analyze_columns()
        self._suggest_normalization()
        
        return self._generate_report()
    
    def _analyze_columns(self):
        """Analyze each column's data type and characteristics"""
        for header in self.headers:
            self.null_counts[header] = 0
            self.max_lengths[header] = 0
            value_types = set()
            
            for row in self.sample_data:
                value = row.get(header, '')
                
                if not value:
                    self.null_counts[header] += 1
                    continue
                
                # Determine data type
                value_types.add(self._get_value_type(value))
                
                # Track max length for strings
                if isinstance(value, str):
                    self.max_lengths[header] = max(self.max_lengths[header], len(value))
            
            # Determine primary type
            if value_types:
                self.column_types[header] = self._determine_primary_type(value_types)
            else:
                self.column_types[header] = 'string'
    
    def _get_value_type(self, value: str) -> str:
        """Determine the data type of a value"""
        try:
            int(value)
            return 'integer'
        except ValueError:
            try:
                float(value)
                return 'float'
            except ValueError:
                # Check for boolean
                if value.lower() in ('true', 'false', 'yes', 'no', '1', '0'):
                    return 'boolean'
                # Check for date formats
                elif '/' in value or '-' in value:
                    parts = value.replace('/', '-').split('-')
                    if len(parts) == 3 and all(part.isdigit() for part in parts):
                        return 'date'
                return 'string'
    
    def _determine_primary_type(self, types: set) -> str:
        """Determine primary type from mixed types"""
        if len(types) == 1:
            return types.pop()
        elif 'float' in types:
            return 'float'  # Integers can be floats
        elif 'integer' in types:
            return 'integer'
        else:
            return 'string'  # Default to string for mixed types
    
    def _suggest_normalization(self):
        """Suggest normalized field names and types"""
        for header in self.headers:
            # Normalize field name
            normalized_name = self._normalize_field_name(header)
            
            # Suggest PostgreSQL type
            pg_type = self._suggest_postgres_type(header)
            
            self.normalized_fields[header] = {
                'normalized_name': normalized_name,
                'postgres_type': pg_type,
                'max_length': self.max_lengths[header],
                'null_count': self.null_counts[header],
                'data_type': self.column_types[header]
            }
    
    def _normalize_field_name(self, field: str) -> str:
        """Normalize field name for database use"""
        # Convert to lowercase
        normalized = field.lower()
        # Replace spaces and special characters with underscores
        normalized = ''.join(c if c.isalnum() else '_' for c in normalized)
        # Remove consecutive underscores
        normalized = '_'.join(filter(None, normalized.split('_')))
        return normalized
    
    def _suggest_postgres_type(self, header: str) -> str:
        """Suggest appropriate PostgreSQL data type"""
        column_type = self.column_types[header]
        
        if column_type == 'integer':
            max_val = max((int(row[header]) for row in self.sample_data if row.get(header, '').isdigit()), default=0)
            if max_val > 2147483647:
                return 'BIGINT'
            else:
                return 'INTEGER'
        elif column_type == 'float':
            return 'DOUBLE PRECISION'
        elif column_type == 'boolean':
            return 'BOOLEAN'
        elif column_type == 'date':
            return 'DATE'
        else:
            max_length = self.max_lengths[header]
            if max_length > 255:
                return 'TEXT'
            else:
                return f'VARCHAR({max_length + 10})'
    
    def _generate_report(self) -> Dict[str, Any]:
        """Generate analysis report"""
        return {
            'file_name': self.csv_path.name,
            'column_count': len(self.headers),
            'row_count': len(self.sample_data),
            'column_analysis': self.normalized_fields,
            'suggested_table_name': self._normalize_field_name(self.csv_path.stem),
            'sql_schema': self._generate_sql_schema()
        }
    
    def _generate_sql_schema(self) -> str:
        """Generate SQL CREATE TABLE statement"""
        table_name = self._normalize_field_name(self.csv_path.stem)
        
        columns = []
        for header, info in self.normalized_fields.items():
            col_def = f"{info['normalized_name']} {info['postgres_type']}"
            if info['null_count'] == 0:
                col_def += " NOT NULL"
            columns.append(col_def)
        
        sql = f"CREATE TABLE {table_name} (\n    id SERIAL PRIMARY KEY,\n    "
        sql += ",\n    ".join(columns)
        sql += "\n);"
        
        return sql

# Example usage
if __name__ == "__main__":
    import sys
    
    if len(sys.argv) < 2:
        print("Usage: python csv_analyzer.py <csv_file>")
        sys.exit(1)
    
    analyzer = CSVAnalyzer(sys.argv[1])
    report = analyzer.analyze()
    
    print(json.dumps(report, indent=4))
    
    # Save report
    report_path = Path(sys.argv[1]).with_suffix('.analysis.json')
    with open(report_path, 'w') as f:
        json.dump(report, f, indent=4)
    
    print(f"\nAnalysis saved to: {report_path}")
    print(f"\nSuggested SQL Schema:\n{report['sql_schema']}")