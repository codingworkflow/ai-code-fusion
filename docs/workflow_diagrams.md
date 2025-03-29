# AI Code Fusion Workflow Diagrams

## Current File Selection and Filtering Workflow

The following diagram illustrates the current workflow for file selection and filtering in AI Code Fusion, highlighting the problematic areas and state management issues.

```mermaid
flowchart TD
    subgraph "Renderer Process (UI & State)"
        UI_SelectDir[User Selects Directory] --> IPC_SelectDir(Invoke 'dialog:selectDirectory')
        UI_ConfigChange[User Changes Configuration] --> State_ConfigUpdate(Update configContent State)
        State_ConfigUpdate --> UI_TabSwitch[User Switches to Source Tab]
        UI_TabSwitch --> Action_RefreshTree{handleTabChange with refreshDirectoryTree}
        UI_Refresh[User Clicks Refresh] --> Action_RefreshDir(Reuse handleDirectorySelect)
        UI_TreeInteract[User Interacts with File Tree] --> State_UpdateSelection(Update selectedFiles/Folders State)
        UI_Analyze[User Clicks Analyze] --> IPC_Analyze(Invoke 'repo:analyze')

        subgraph "State Management Issues"
            State_RootPath[(rootPath)]
            State_DirTree[(directoryTree)]
            State_Selection[(selectedFiles / selectedFolders)]
            State_Analysis[(analysisResult)]

            IPC_SelectDir_Resp --> State_RootPath
            IPC_SelectDir_Resp -.-> Missing_Reset[❌ Missing Selection Reset]
            State_RootPath --> IPC_GetTree
            IPC_GetTree_Resp --> State_DirTree

            Action_RefreshTree --> State_Reset[Selection Reset]
            State_Reset --> IPC_ResetCache
            IPC_ResetCache --> IPC_GetTree_Refresh(Invoke 'fs:getDirectoryTree')

            Action_RefreshDir -.-> Missing_Reset2[❌ Missing Selection Reset]
        end
    end

    subgraph "Main Process"
        IPC_SelectDir --> Main_SelectDir(Show Directory Dialog)
        Main_SelectDir --> IPC_SelectDir_Resp(Return Selected Path)

        IPC_GetTree & IPC_GetTree_Refresh --> Main_ParseConfig(Parse Config)
        Main_ParseConfig --> Main_CheckUseGitignore{Check use_gitignore}
        Main_CheckUseGitignore -- Yes --> Main_ParseGitignore(Parse .gitignore)
        Main_CheckUseGitignore -- No --> Main_SkipGitignore(Skip Gitignore)

        Main_ParseGitignore --> Main_MergePatterns(Merge Patterns into Array + Properties ❌)
        Main_SkipGitignore --> Main_MergePatterns

        Main_MergePatterns --> Main_WalkDir(Walk Directory)
        Main_WalkDir -- For Each Item --> Filter_ShouldExclude{shouldExclude Check}

        subgraph "Pattern Matching Issues"
            Filter_ShouldExclude -- Check Includes --> Pattern_IncludeCheck{Check GitIgnore Includes First}
            Pattern_IncludeCheck -- Match --> Keep_File(Don't Exclude)
            Pattern_IncludeCheck -- No Match --> Pattern_ExcludeCheck{Check All Excludes}
            Pattern_ExcludeCheck -- Match --> Exclude_File(Exclude File)
            Pattern_ExcludeCheck -- No Match --> Keep_File

            Pattern_Priority:::note(["Note: GitIgnore negated patterns (includes) are checked first, following standard GitIgnore behavior where negated patterns override excludes"])
            class Pattern_Priority note
        end

        Keep_File --> Main_AddToTree(Add to Directory Tree)
        Exclude_File --> Main_SkipFile(Skip File)
        Main_AddToTree & Main_SkipFile --> Main_ContinueWalk(Continue Walking)
        Main_ContinueWalk --> Main_WalkDir

        Main_WalkDir -- Complete --> IPC_GetTree_Resp(Return Filtered Tree)

        IPC_Analyze --> Main_CreateFileAnalyzer(Create FileAnalyzer)
        Main_CreateFileAnalyzer --> Main_ProcessSelectedFiles(Process Selected Files)

        subgraph "FileAnalyzer Issues"
            Main_ProcessSelectedFiles -- For Each File --> Path_Validation{Validate Path}
            Path_Validation -- Invalid --> Skip_InvalidFile(Skip Invalid File)
            Path_Validation -- Valid --> Binary_Check{Check if Binary}
            Binary_Check -- Binary --> Record_Binary(Record Binary File)
            Binary_Check -- Text --> Should_Process{shouldProcessFile Check}

            Should_Process -- First --> Pattern_Matching{Custom Pattern Matching ❌}
            Pattern_Matching -- Exclude --> Skip_FilteredFile(Skip File)
            Pattern_Matching -- Include --> UseCustomExcludes{Check use_custom_excludes}

            UseCustomExcludes -- Yes --> Extension_Filter{Check Extension}
            UseCustomExcludes -- No --> Skip_ExtensionFilter(Skip Extension Filter)

            Extension_Filter -- Match --> Process_File(Process File)
            Extension_Filter -- No Match --> Skip_FilteredFile
            Skip_ExtensionFilter --> Process_File
        end

        Process_File --> Count_Tokens(Count Tokens)
        Count_Tokens --> Collect_FileInfo(Collect File Info)
        Record_Binary --> Collect_FileInfo
        Skip_InvalidFile --> Main_ProcessSelectedFiles
        Skip_FilteredFile --> Main_ProcessSelectedFiles
        Collect_FileInfo --> Main_ProcessSelectedFiles

        Main_ProcessSelectedFiles -- Complete --> IPC_Analyze_Resp(Return Analysis Result)

        IPC_ResetCache --> Main_ClearCache(Clear GitIgnore Cache)
        Main_ClearCache --> IPC_ResetCache_Resp(Return Success)
    end

    %% Define problematic connections with red
    linkStyle 8,9,23,24,27,47,48 stroke:red;
```

## Improved Workflow (Proposed)

The following diagram shows the proposed improvements to address the identified issues:

```mermaid
flowchart TD
    subgraph "Renderer Process (UI & State)"
        UI_SelectDir[User Selects Directory] --> IPC_SelectDir(Invoke 'dialog:selectDirectory')
        UI_ConfigChange[User Changes Configuration] --> State_ConfigUpdate(Update configContent State)
        State_ConfigUpdate --> UI_TabSwitch[User Switches to Source Tab]
        UI_TabSwitch --> Action_RefreshTree{handleTabChange with refreshDirectoryTree}
        UI_Refresh[User Clicks Refresh] --> Action_RefreshTree
        UI_TreeInteract[User Interacts with File Tree] --> State_UpdateSelection(Update selectedFiles/Folders State)
        UI_Analyze[User Clicks Analyze] --> Action_ValidateSelection(Validate Selected Files)
        Action_ValidateSelection --> IPC_Analyze(Invoke 'repo:analyze')

        subgraph "Improved State Management"
            State_RootPath[(rootPath)]
            State_DirTree[(directoryTree)]
            State_Selection[(selectedFiles / selectedFolders)]
            State_Analysis[(analysisResult)]

            IPC_SelectDir_Resp --> Action_ResetStates(Reset All States ✓)
            Action_ResetStates --> State_RootPath
            State_RootPath --> IPC_ResetCache
            IPC_ResetCache --> IPC_GetTree(Invoke 'fs:getDirectoryTree')
            IPC_GetTree_Resp --> State_DirTree

            Action_RefreshTree --> Action_ResetStates2(Reset Selection States ✓)
            Action_ResetStates2 --> IPC_ResetCache2(Reset GitIgnore Cache)
            IPC_ResetCache2 --> IPC_GetTree_Refresh(Invoke 'fs:getDirectoryTree')
        end
    end

    subgraph "Main Process"
        IPC_SelectDir --> Main_SelectDir(Show Directory Dialog)
        Main_SelectDir --> IPC_SelectDir_Resp(Return Selected Path)

        IPC_GetTree & IPC_GetTree_Refresh --> Main_ParseConfig(Parse Config)
        Main_ParseConfig --> Main_CheckUseGitignore{Check use_gitignore}
        Main_CheckUseGitignore -- Yes --> Main_ParseGitignore(Parse .gitignore)
        Main_CheckUseGitignore -- No --> Main_SkipGitignore(Skip Gitignore)

        Main_ParseGitignore --> Main_CreatePatternObject(Create Pattern Object ✓)
        Main_SkipGitignore --> Main_CreatePatternObject

        Main_CreatePatternObject --> Main_WalkDir(Walk Directory)
        Main_WalkDir -- For Each Item --> Filter_ShouldExclude{shouldExclude Check}

        subgraph "Improved Pattern Matching"
            Filter_ShouldExclude --> Pattern_Priority{Apply Correct Priority Rules ✓}
            Pattern_Priority --> Pattern_Check{Use Standardized & Pre-compiled Matcher ✓}
            Pattern_Check -- Exclude --> Exclude_File(Exclude File)
            Pattern_Check -- Include --> Keep_File(Keep File)

            Pattern_Priority:::note2(["Note: GitIgnore includes still checked first but using standardized matcher"])
            class Pattern_Priority note2
        end

        Keep_File --> Main_AddToTree(Add to Directory Tree)
        Exclude_File --> Main_SkipFile(Skip File)
        Main_AddToTree & Main_SkipFile --> Main_ContinueWalk(Continue Walking)
        Main_ContinueWalk --> Main_WalkDir

        Main_WalkDir -- Complete --> IPC_GetTree_Resp(Return Filtered Tree)

        IPC_Analyze --> Main_CreateFileAnalyzer(Create FileAnalyzer)
        Main_CreateFileAnalyzer --> Main_ProcessSelectedFiles(Process Selected Files)

        subgraph "Improved FileAnalyzer"
            Main_ProcessSelectedFiles -- For Each File --> Path_Validation{Validate Path ✓}
            Path_Validation -- Invalid --> Skip_InvalidFile(Skip Invalid File)
            Path_Validation -- Valid --> Binary_Check{Check if Binary}
            Binary_Check -- Binary --> Record_Binary(Record Binary File)
            Binary_Check -- Text --> Standard_Matcher{Use Standard Matcher ✓}

            Standard_Matcher -- Exclude --> Skip_FilteredFile(Skip File)
            Standard_Matcher -- Include --> Extension_Check{Check Extension Filter Flag}

            Extension_Check -- Enabled --> Extension_Filter{Check Extension ✓}
            Extension_Check -- Disabled --> Process_File(Process File)

            Extension_Filter -- Match --> Process_File
            Extension_Filter -- No Match --> Skip_FilteredFile
        end

        Process_File --> Count_Tokens(Count Tokens)
        Count_Tokens --> Collect_FileInfo(Collect File Info)
        Record_Binary --> Collect_FileInfo
        Skip_InvalidFile --> Main_ProcessSelectedFiles
        Skip_FilteredFile --> Main_ProcessSelectedFiles
        Collect_FileInfo --> Main_ProcessSelectedFiles

        Main_ProcessSelectedFiles -- Complete --> IPC_Analyze_Resp(Return Analysis Result)

        IPC_ResetCache & IPC_ResetCache2 --> Main_ClearCache(Clear GitIgnore Cache)
        Main_ClearCache --> IPC_ResetCache_Resp(Return Success)
    end

    %% Define improved connections with green
    linkStyle 10,11,12,13,14,15,16,17,34,35,36,45,46,47,48 stroke:green;
```

These diagrams highlight:

1. **Current Implementation Issues:**

   - Missing state resets when selecting directories
   - Problematic data structure (array with properties)
   - Inconsistent pattern matching between tree view and analysis
   - Incorrect priority handling between custom excludes and gitignore includes
   - Extension filtering tied to custom excludes flag

2. **Proposed Improvements:**
   - Complete state reset during directory selection and refresh
   - Cleaner pattern object structure
   - Standardized pattern matching across the application
   - Correct priority handling respecting the original plan
   - Decoupled extension filtering from custom excludes
   - Improved path validation throughout the workflow
