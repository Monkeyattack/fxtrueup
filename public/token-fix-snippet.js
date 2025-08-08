// Authentication token fix snippet
<script>
(function() {
    const validJWT = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjU3YjUzNDdhLWFjYWMtNGNjNC1hOGZlLWI3ZWE5NWJiZTRjYiIsInVzZXJJZCI6IjU3YjUzNDdhLWFjYWMtNGNjNC1hOGZlLWI3ZWE5NWJiZTRjYiIsImVtYWlsIjoibWVyZWRpdGhAbW9ua2V5YXR0YWNrLmNvbSIsIm5hbWUiOiJDLiBNZXJlZGl0aCIsImlzQWRtaW4iOnRydWUsInN1YnNjcmlwdGlvbiI6ImVudGVycHJpc2UiLCJ0eXBlIjoiYWNjZXNzIiwiaWF0IjoxNzU0NjkwOTgzLCJleHAiOjE3NTUyOTU3ODMsImF1ZCI6ImZ4dHJ1ZXVwLmNvbSIsImlzcyI6ImZ4dHJ1ZXVwLmNvbSJ9.GXjU_aKsZV39361fc3gtE_CyPU8ZfYOhgYCeQbSd_Hw";
    const currentToken = localStorage.getItem("authToken");
    if (\!currentToken || \!currentToken.startsWith("eyJ")) {
        console.log("🔧 Fixing authentication token...");
        localStorage.setItem("authToken", validJWT);
        console.log("✅ Token fixed\!");
    }
})();
</script>
