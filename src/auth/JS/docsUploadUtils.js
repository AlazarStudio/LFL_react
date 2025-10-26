import getToken from '../../../../getToken'
import uploadsConfig from '../../../../uploadsConfig'

// Функция для загрузки документа на сервер
export const uploadDocument = async file => {
	const formData = new FormData()
	formData.append('document', file)

	try {
		const response = await fetch(`${uploadsConfig}/upload-doc`, {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${getToken}`
			},
			body: formData
		})

		if (!response.ok) {
			const errorMessage = await response.text()
			console.error('Ошибка при загрузке документа на сервер:', errorMessage)
			throw new Error('Ошибка при загрузке документа на сервер')
		}

		const data = await response.json()
		return data.filePath // Убедитесь, что это путь к загруженному документу
	} catch (error) {
		console.error('Ошибка при загрузке документа:', error)
		throw error
	}
}

// Функция для обработки сохранения формы с документом
export const handleSaveDocument = async values => {
	if (values.src && values.src.rawFile) {
		// Загружаем документ на сервер
		const uploadedDocument = await uploadDocument(values.src.rawFile)

		// Заменяем файл ссылкой на загруженный документ
		values.src = uploadedDocument
	}

	return values
}

// Функция для обновления документа
export const handleSaveWithDocument = async values => {
	const existingDocument = values.src || '' // Существующий документ
	const newFile = values.src.rawFile || null // Новый загруженный файл

	if (newFile) {
		// Загружаем новый документ на сервер
		const uploadedDocument = await uploadDocument(newFile)
		values.src = uploadedDocument
	} else {
		values.src = existingDocument
	}

	// Удаляем временные поля
	delete values.src.rawFile

	return values
}
