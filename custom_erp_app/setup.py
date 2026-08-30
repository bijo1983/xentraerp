from setuptools import setup, find_packages

setup(
    name='custom_erp',
    version='0.1.0',
    packages=find_packages(),
    zip_safe=False,
    include_package_data=True,
    install_requires=['frappe'],
)
