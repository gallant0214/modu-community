package com.moduji.app.ui.jobs

import androidx.lifecycle.LiveData
import androidx.lifecycle.MutableLiveData
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.moduji.app.data.model.JobPostRequest
import com.moduji.app.data.repository.JobsRepository
import kotlinx.coroutines.launch

class JobWriteViewModel : ViewModel() {

    private val _submitResult = MutableLiveData<Boolean>()
    val submitResult: LiveData<Boolean> = _submitResult

    private val _isLoading = MutableLiveData(false)
    val isLoading: LiveData<Boolean> = _isLoading

    fun submitJobPost(request: JobPostRequest, authorName: String = "") {
        viewModelScope.launch {
            _isLoading.value = true
            JobsRepository.addJobPost(request, authorName).fold(
                onSuccess = { _submitResult.value = true },
                onFailure = { _submitResult.value = false }
            )
            _isLoading.value = false
        }
    }
}
