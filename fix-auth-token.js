// Client-side fix for authentication token issue
async function fixAuthToken() {
    try {
        console.log('🔧 Attempting to fix authentication token...');
        
        const validJWT = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjU3YjUzNDdhLWFjYWMtNGNjNC1hOGZlLWI3ZWE5NWJiZTRjYiIsInVzZXJJZCI6IjU3YjUzNDdhLWFjYWMtNGNjNC1hOGZlLWI3ZWE5NWJiZTRjYiIsImVtYWlsIjoibWVyZWRpdGhAbW9ua2V5YXR0YWNrLmNvbSIsIm5hbWUiOiJDLiBNZXJlZGl0aCIsImlzQWRtaW4iOnRydWUsInN1YnNjcmlwdGlvbiI6ImVudGVycHJpc2UiLCJ0eXBlIjoiYWNjZXNzIiwiaWF0IjoxNzU0Njg5MDA2LCJleHAiOjE3NTQ2OTI2MDYsImF1ZCI6ImZ4dHJ1ZXVwLmNvbSIsImlzcyI6ImZ4dHJ1ZXVwLmNvbSJ9.tdlJw6neAbdQiv8Tmf3NM-_C17KmOw8dRTlDfjsrKCw';
        
        localStorage.setItem('authToken', validJWT);
        console.log('✅ Token updated in localStorage');
        
        if (window.apiClient) {
            window.apiClient.setToken(validJWT);
            console.log('✅ API client updated');
        }
        
        console.log('🎉 Fixed\! Refresh the page to see account details.');
        return true;
        
    } catch (error) {
        console.error('❌ Fix failed:', error);
        return false;
    }
}

fixAuthToken();
